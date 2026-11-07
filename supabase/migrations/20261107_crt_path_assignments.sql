-- CRT-012: Batch-based learning path assignments

BEGIN;

CREATE TABLE IF NOT EXISTS public.crt_path_assignments (
  path_id uuid NOT NULL REFERENCES public.crt_paths(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (path_id, batch_id)
);

CREATE INDEX IF NOT EXISTS crt_path_assignments_batch_id_idx
  ON public.crt_path_assignments (batch_id);

REVOKE ALL ON TABLE public.crt_path_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crt_path_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crt_path_assignments TO service_role;

ALTER TABLE public.crt_path_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crt_path_assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage crt path assignments" ON public.crt_path_assignments;
CREATE POLICY "Staff manage crt path assignments" ON public.crt_path_assignments
  FOR ALL TO authenticated
  USING ((SELECT public.has_permission('batches.manage')))
  WITH CHECK ((SELECT public.has_permission('batches.manage')));

DROP POLICY IF EXISTS "Students read crt path assignments for own batches" ON public.crt_path_assignments;
CREATE POLICY "Students read crt path assignments for own batches" ON public.crt_path_assignments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_permission('crt.access'))
    AND EXISTS (
      SELECT 1
      FROM public.batch_members bm
      WHERE bm.batch_id = crt_path_assignments.batch_id
        AND bm.user_id = (SELECT auth.uid())
    )
  );

-- Shared assignment gate (SECURITY DEFINER avoids RLS recursion between paths ↔ assignments).
CREATE OR REPLACE FUNCTION public.crt_student_assigned_path_access(target_path uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.crt_paths AS p
    WHERE p.id = target_path
      AND p.status = 'published'
      AND public.has_permission('crt.access')
      AND EXISTS (
        SELECT 1
        FROM public.crt_path_assignments AS a
        INNER JOIN public.batch_members AS bm ON bm.batch_id = a.batch_id
        WHERE a.path_id = p.id
          AND bm.user_id = (SELECT auth.uid())
      )
  );
$$;

REVOKE ALL ON FUNCTION public.crt_student_assigned_path_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crt_student_assigned_path_access(uuid) TO authenticated, service_role;

-- Student question view (security_invoker = true) inherits crt_questions RLS; omits answer keys.

DROP POLICY IF EXISTS "Students read published crt paths" ON public.crt_paths;
DROP POLICY IF EXISTS "Students read published crtpaths" ON public.crt_paths;
CREATE POLICY "Students read assigned published crt paths" ON public.crt_paths
  FOR SELECT TO authenticated
  USING ((SELECT public.crt_student_assigned_path_access(id)));

DROP POLICY IF EXISTS "Students read modules on published paths" ON public.crt_modules;
CREATE POLICY "Students read modules on assigned published paths" ON public.crt_modules
  FOR SELECT TO authenticated
  USING ((SELECT public.crt_student_assigned_path_access(path_id)));

DROP POLICY IF EXISTS "Students read questions on published paths" ON public.crt_questions;
DROP POLICY IF EXISTS "Students read questions on assignedpublished paths" ON public.crt_questions;
DROP POLICY IF EXISTS "Students read questions on assigned published paths" ON public.crt_questions;
CREATE POLICY "Students read questions on assigned published paths" ON public.crt_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.crt_modules AS m
      WHERE m.id = crt_questions.module_id
        AND (SELECT public.crt_student_assigned_path_access(m.path_id))
    )
  );

DROP POLICY IF EXISTS "Students insert own crt attempts" ON public.crt_attempts;
CREATE POLICY "Students insert own crt attempts" ON public.crt_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT public.has_permission('crt.access'))
    AND kind = 'practice'
    AND status = 'in_progress'
    AND submitted_at IS NULL
    AND score IS NULL
    AND max_score IS NULL
    AND (SELECT public.crt_student_assigned_path_access(crt_attempts.path_id))
    AND (
      crt_attempts.module_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.crt_modules AS m
        WHERE m.id = crt_attempts.module_id
          AND m.path_id = crt_attempts.path_id
      )
    )
  );

-- Assignment managers need read access for the admin assignment UI (route: batches.manage).
DROP POLICY IF EXISTS "Staff read crt paths for batch assignment" ON public.crt_paths;
CREATE POLICY "Staff read crt paths for batch assignment" ON public.crt_paths
  FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('batches.manage')));

DROP POLICY IF EXISTS "Staff read batches for crt assignment" ON public.batches;
CREATE POLICY "Staff read batches for crt assignment" ON public.batches
  FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('batches.manage')));

CREATE OR REPLACE VIEW public.crt_questions_student
WITH (security_invoker = true) AS
SELECT id, module_id, stem, options, topic, difficulty, created_at
FROM public.crt_questions;

-- Mock start must not bypass path assignment RLS (SECURITY DEFINER insert on crt_attempts).
CREATE OR REPLACE FUNCTION public.crt_start_mock_attempt(target_path uuid)
RETURNS TABLE (mock_attempt_id uuid, mock_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_blueprint public.crt_mock_blueprints%ROWTYPE;
  v_section record;
  v_attempt uuid;
  v_started timestamptz;
  v_existing_expiry timestamptz;
BEGIN
  IF v_user IS NULL
     OR NOT public.has_permission('crt.access') THEN
    RAISE EXCEPTION 'CRT access required';
  END IF;

  SELECT a.id, m.expires_at
    INTO v_attempt, v_existing_expiry
  FROM public.crt_attempts a
  LEFT JOIN public.crt_mock_attempt_meta m ON m.attempt_id = a.id
  WHERE a.user_id = v_user
    AND a.path_id = target_path
    AND a.kind = 'mock'
    AND a.status = 'in_progress'
  ORDER BY a.started_at DESC
  LIMIT 1
  FOR UPDATE OF a;

  IF v_attempt IS NOT NULL THEN
    IF v_existing_expiry IS NULL THEN
      RAISE EXCEPTION 'Mock attempt expiry metadata is missing';
    ELSIF v_existing_expiry > clock_timestamp() THEN
      mock_attempt_id := v_attempt;
      mock_expires_at := v_existing_expiry;
      RETURN NEXT;
      RETURN;
    ELSE
      PERFORM public.crt_submit_mock_attempt(v_attempt);
      v_attempt := NULL;
      v_existing_expiry := NULL;
    END IF;
  END IF;

  IF NOT public.crt_student_assigned_path_access(target_path) THEN
    RAISE EXCEPTION 'Published learning path not found';
  END IF;

  SELECT *
    INTO v_blueprint
  FROM public.crt_mock_blueprints b
  WHERE b.path_id = target_path
  FOR UPDATE;

  IF v_blueprint.id IS NULL THEN
    RAISE EXCEPTION 'Mock test is not configured';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crt_mock_blueprint_sections s
    WHERE s.blueprint_id = v_blueprint.id
  ) THEN
    RAISE EXCEPTION 'Mock test has no configured sections';
  END IF;

  FOR v_section IN
    SELECT s.*
    FROM public.crt_mock_blueprint_sections s
    WHERE s.blueprint_id = v_blueprint.id
  LOOP
    IF (
      SELECT COUNT(*)
      FROM public.crt_questions q
      WHERE q.module_id = v_section.module_id
    ) < v_section.question_count THEN
      RAISE EXCEPTION 'Not enough questions in configured module';
    END IF;
  END LOOP;

  INSERT INTO public.crt_attempts (user_id, path_id, module_id, kind, status)
  VALUES (v_user, target_path, NULL, 'mock', 'in_progress')
  RETURNING id, started_at INTO v_attempt, v_started;

  INSERT INTO public.crt_mock_attempt_meta (attempt_id, total_minutes, expires_at)
  VALUES (
    v_attempt,
    v_blueprint.total_minutes,
    v_started + make_interval(mins => v_blueprint.total_minutes)
  );

  FOR v_section IN
    SELECT s.*
    FROM public.crt_mock_blueprint_sections s
    WHERE s.blueprint_id = v_blueprint.id
    ORDER BY s.sort_order, s.id
  LOOP
    INSERT INTO public.crt_mock_attempt_questions (
      attempt_id, path_id, question_id, module_id, section_order, question_order
    )
    SELECT
      v_attempt,
      target_path,
      selected.id,
      v_section.module_id,
      v_section.sort_order,
      selected.question_order
    FROM (
      SELECT
        chosen.id,
        (ROW_NUMBER() OVER (ORDER BY random()) - 1)::integer AS question_order
      FROM (
        SELECT q.id
        FROM public.crt_questions q
        WHERE q.module_id = v_section.module_id
        ORDER BY random()
        LIMIT v_section.question_count
      ) chosen
    ) selected;
  END LOOP;

  mock_attempt_id := v_attempt;

  SELECT m.expires_at
    INTO mock_expires_at
  FROM public.crt_mock_attempt_meta m
  WHERE m.attempt_id = v_attempt;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.crt_start_mock_attempt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crt_start_mock_attempt(uuid) TO authenticated;

COMMIT;
