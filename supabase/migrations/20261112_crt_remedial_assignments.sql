-- CRT-016: Mentor remedial module assignments for selected students.
--
-- PREREQUISITE: Apply CRT-015 first (20261111_crt_mentor_dashboard.sql).
-- This migration calls public.crt_mentor_dashboard_require_access(); it will
-- fail if CRT-015 has not been applied.
--
-- Mentors with dashboard.view or students.manage assign extra practice modules.
-- Students with crt.access see open rows via crt_remedial_list_open_for_student.
-- Open rows become done when the student submits a practice attempt on that module
-- (patched crt_submit_attempt).
--
-- Depends on: crt_modules, crt_paths, crt_path_assignments, batch_members,
-- crt_mentor_dashboard_require_access (CRT-015), crt_private.grading_authorizations.

BEGIN;

-- ─── Helpers (not granted to authenticated callers) ───────────────────────────

CREATE OR REPLACE FUNCTION public.crt_user_assigned_path_access(
  p_user_id uuid,
  p_path_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.crt_paths AS p
    WHERE p.id = p_path_id
      AND p.status = 'published'
      AND EXISTS (
        SELECT 1
        FROM public.crt_path_assignments AS a
        INNER JOIN public.batch_members AS bm ON bm.batch_id = a.batch_id
        WHERE a.path_id = p.id
          AND bm.user_id = p_user_id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.crt_user_assigned_path_access(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- Evaluates staff_label_permissions for a target user (not auth.uid()).
-- Mirrors public.has_permission(perm) from staff labels migrations.
CREATE OR REPLACE FUNCTION public.user_has_permission(
  p_user_id uuid,
  perm text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = p_user_id
        AND role = 'ADMIN'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.staff_label_members
      WHERE user_id = p_user_id
    )
  )
  OR EXISTS (
    SELECT 1
    FROM public.staff_label_members AS m
    JOIN public.staff_label_permissions AS lp ON lp.label_id = m.label_id
    WHERE m.user_id = p_user_id
      AND lp.permission_key = perm
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_permission(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE public.crt_remedial_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.crt_modules(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'done')),
  due_at timestamptz,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT crt_remedial_status_times_check CHECK (
    (status = 'open' AND completed_at IS NULL)
    OR (status = 'done' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX crt_remedial_assignments_user_open_idx
  ON public.crt_remedial_assignments (user_id)
  WHERE status = 'open';

CREATE INDEX crt_remedial_assignments_module_id_idx
  ON public.crt_remedial_assignments (module_id);

CREATE UNIQUE INDEX crt_remedial_assignments_open_user_module_uidx
  ON public.crt_remedial_assignments (user_id, module_id)
  WHERE status = 'open';

REVOKE ALL ON TABLE public.crt_remedial_assignments FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.crt_remedial_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crt_remedial_assignments TO service_role;

ALTER TABLE public.crt_remedial_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crt_remedial_assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read crt remedial assignments" ON public.crt_remedial_assignments;
CREATE POLICY "Staff read crt remedial assignments" ON public.crt_remedial_assignments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_permission('dashboard.view'))
    OR (SELECT public.has_permission('students.manage'))
  );

DROP POLICY IF EXISTS "Students read own open crt remedial assignments" ON public.crt_remedial_assignments;
CREATE POLICY "Students read own open crt remedial assignments" ON public.crt_remedial_assignments
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND status = 'open'
    AND (SELECT public.has_permission('crt.access'))
  );

CREATE OR REPLACE FUNCTION public.crt_remedial_mark_done(
  p_user_id uuid,
  p_module_id uuid,
  p_completed_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_module_id IS NULL OR p_completed_at IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.crt_remedial_assignments AS ra
  SET status = 'done',
      completed_at = p_completed_at
  WHERE ra.user_id = p_user_id
    AND ra.module_id = p_module_id
    AND ra.status = 'open';
END;
$$;

REVOKE ALL ON FUNCTION public.crt_remedial_mark_done(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ─── Staff bulk assign ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crt_remedial_assign_bulk(
  p_user_ids uuid[],
  p_module_id uuid,
  p_due_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_path_id uuid;
  v_user_id uuid;
  v_assigned integer := 0;
  v_skipped integer := 0;
BEGIN
  PERFORM public.crt_mentor_dashboard_require_access();

  IF p_module_id IS NULL THEN
    RAISE EXCEPTION 'module_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN
    RAISE EXCEPTION 'user_ids must be a non-empty array' USING ERRCODE = '22023';
  END IF;

  SELECT m.path_id
    INTO v_path_id
  FROM public.crt_modules AS m
  JOIN public.crt_paths AS p ON p.id = m.path_id
  WHERE m.id = p_module_id
    AND p.status = 'published';

  IF v_path_id IS NULL THEN
    RAISE EXCEPTION 'module is not on a published learning path' USING ERRCODE = '22023';
  END IF;

  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
  BEGIN
    IF v_user_id IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles AS pr
      WHERE pr.id = v_user_id
        AND COALESCE(pr.role, 'USER') <> 'ADMIN'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF NOT public.user_has_permission(v_user_id, 'crt.access') THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF NOT public.crt_user_assigned_path_access(v_user_id, v_path_id) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.crt_remedial_assignments AS ra
      WHERE ra.user_id = v_user_id
        AND ra.module_id = p_module_id
        AND ra.status = 'open'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.crt_remedial_assignments (
      user_id,
      module_id,
      assigned_by,
      status,
      due_at,
      assigned_at
    )
    VALUES (
      v_user_id,
      p_module_id,
      v_caller,
      'open',
      p_due_at,
      now()
    );

    v_assigned := v_assigned + 1;
  EXCEPTION
    WHEN unique_violation THEN
      v_skipped := v_skipped + 1;
  END;
  END LOOP;

  RETURN jsonb_build_object(
    'assigned', v_assigned,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crt_remedial_assign_bulk(uuid[], uuid, timestamptz)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.crt_remedial_assign_bulk(uuid[], uuid, timestamptz)
  TO authenticated, service_role;

-- ─── Student open assignments ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crt_remedial_list_open_for_student()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission('crt.access') THEN
    RAISE EXCEPTION 'CRT access required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'assignments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'assignmentId', row_data.id,
          'moduleId', row_data.module_id,
          'moduleTitle', row_data.module_title,
          'pathId', row_data.path_id,
          'pathTitle', row_data.path_title,
          'dueAt', row_data.due_at,
          'assignedAt', row_data.assigned_at
        )
        ORDER BY row_data.due_at NULLS LAST, row_data.assigned_at DESC
      )
      FROM (
        SELECT
          ra.id,
          ra.module_id,
          m.title AS module_title,
          m.path_id,
          p.title AS path_title,
          ra.due_at,
          ra.assigned_at
        FROM public.crt_remedial_assignments AS ra
        JOIN public.crt_modules AS m ON m.id = ra.module_id
        JOIN public.crt_paths AS p ON p.id = m.path_id
        WHERE ra.user_id = v_user
          AND ra.status = 'open'
          AND p.status = 'published'
      ) AS row_data
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crt_remedial_list_open_for_student()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.crt_remedial_list_open_for_student()
  TO authenticated, service_role;

-- ─── Practice submit: complete remedial assignments ──────────────────────────
-- Matches production crt_submit_attempt from 20261105_crt_mock_test.sql plus
-- remedial completion after a successful practice submit.

CREATE OR REPLACE FUNCTION public.crt_submit_attempt(target_attempt uuid)
RETURNS TABLE (attempt_score numeric, attempt_max_score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_path uuid;
  v_module uuid;
  v_started timestamptz;
  v_submitted timestamptz;
  v_score numeric;
  v_max numeric;
  v_duration integer;
  v_attempt_rows integer;
BEGIN
  IF v_user IS NULL OR NOT public.has_permission('crt.access') THEN
    RAISE EXCEPTION 'CRT access required';
  END IF;

  SELECT path_id, module_id, started_at
    INTO v_path, v_module, v_started
  FROM public.crt_attempts
  WHERE id = target_attempt
    AND user_id = v_user
    AND status = 'in_progress'
    AND kind = 'practice'
  FOR UPDATE;

  IF v_path IS NULL THEN
    RAISE EXCEPTION 'In-progress attempt not found';
  END IF;

  PERFORM 1
  FROM public.crt_attempt_answers
  WHERE attempt_id = target_attempt
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.crt_attempt_answers AS ans
    JOIN public.crt_questions AS q ON q.id = ans.question_id
    JOIN public.crt_modules AS qm ON qm.id = q.module_id
    WHERE ans.attempt_id = target_attempt
      AND (
        qm.path_id IS DISTINCT FROM v_path
        OR (v_module IS NOT NULL AND q.module_id IS DISTINCT FROM v_module)
      )
  ) THEN
    RAISE EXCEPTION 'Attempt contains a question outside its scope';
  END IF;

  INSERT INTO crt_private.grading_authorizations (
    transaction_id,
    backend_pid,
    attempt_id
  )
  VALUES (
    txid_current(),
    pg_backend_pid(),
    target_attempt
  );

  UPDATE public.crt_attempt_answers AS ans
  SET is_correct = (
    ans.selected_index IS NOT NULL
    AND ans.selected_index = q.correct_index
  )
  FROM public.crt_questions AS q
  JOIN public.crt_modules AS qm ON qm.id = q.module_id
  WHERE ans.attempt_id = target_attempt
    AND q.id = ans.question_id
    AND qm.path_id = v_path
    AND (v_module IS NULL OR q.module_id = v_module);

  SELECT COUNT(*)
    INTO v_max
  FROM public.crt_questions AS q
  JOIN public.crt_modules AS qm ON qm.id = q.module_id
  WHERE qm.path_id = v_path
    AND (v_module IS NULL OR q.module_id = v_module);

  SELECT COUNT(*)
    INTO v_score
  FROM public.crt_attempt_answers AS ans
  JOIN public.crt_questions AS q ON q.id = ans.question_id
  JOIN public.crt_modules AS qm ON qm.id = q.module_id
  WHERE ans.attempt_id = target_attempt
    AND ans.is_correct IS TRUE
    AND qm.path_id = v_path
    AND (v_module IS NULL OR q.module_id = v_module);

  v_submitted := clock_timestamp();

  v_duration := GREATEST(
    0,
    FLOOR(EXTRACT(EPOCH FROM (v_submitted - v_started)))
  )::integer;

  UPDATE public.crt_attempts
  SET status = 'submitted',
      submitted_at = v_submitted,
      score = v_score,
      max_score = v_max,
      duration_seconds = v_duration
  WHERE id = target_attempt
    AND user_id = v_user
    AND status = 'in_progress';

  GET DIAGNOSTICS v_attempt_rows = ROW_COUNT;

  IF v_module IS NOT NULL AND v_attempt_rows = 1 THEN
    PERFORM public.crt_remedial_mark_done(v_user, v_module, v_submitted);
  END IF;

  DELETE FROM crt_private.grading_authorizations
  WHERE transaction_id = txid_current()
    AND backend_pid = pg_backend_pid()
    AND attempt_id = target_attempt;

  attempt_score := v_score;
  attempt_max_score := v_max;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.crt_submit_attempt(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.crt_submit_attempt(uuid)
  TO authenticated;

COMMIT;
