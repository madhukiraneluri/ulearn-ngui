-- CRT-013: Company packs (TCS / Infosys style practice sets).
--
-- Questions stay in crt_questions. A pack stores question ids only.
-- Attempts are separate from crt_attempts so CRT practice, mock tests,
-- CRT-012 path assignment, and the existing attempt triggers stay unchanged.
--
-- Grading uses crt_company_pack_private.grading_authorizations, created here.
-- That schema is not exposed to the API. anon, authenticated, and service_role
-- have no privileges on it. Start and submit insert a row for this transaction
-- and backend pid, update score and is_correct, then delete the row.
-- This migration does not read or set the existing crt.grading configuration.
--
-- Lock order, held until the transaction commits:
-- 1. crt_company_packs, then any write to crt_company_pack_questions.
--    When a question moves between packs, lock the two pack ids in ascending order.
-- 2. crt_company_pack_attempts, then any write to crt_company_pack_attempt_answers.
-- Start locks the pack and never locks an existing attempt first.
-- Submit and the answer guard lock the attempt and never lock a pack.

BEGIN;

-- ─── Private grading authorization ──────────────────────────────────────────
-- Separate from crt.grading and from any practice or mock authorization table.
-- No policies are created. Forced RLS denies every role that does not bypass
-- it, and no API role receives schema or table privileges.

CREATE SCHEMA IF NOT EXISTS crt_company_pack_private;

REVOKE ALL ON SCHEMA crt_company_pack_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE crt_company_pack_private.grading_authorizations (
  transaction_id bigint NOT NULL,
  backend_pid integer NOT NULL,
  attempt_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (transaction_id, backend_pid, attempt_id)
);

REVOKE ALL ON TABLE crt_company_pack_private.grading_authorizations
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE crt_company_pack_private.grading_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crt_company_pack_private.grading_authorizations FORCE ROW LEVEL SECURITY;

-- ─── Catalog ────────────────────────────────────────────────────────────────

CREATE TABLE public.crt_company_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crt_company_packs_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE public.crt_company_pack_questions (
  pack_id uuid NOT NULL REFERENCES public.crt_company_packs(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.crt_questions(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (pack_id, question_id),
  CONSTRAINT crt_company_pack_questions_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX crt_company_pack_questions_question_id_idx
  ON public.crt_company_pack_questions (question_id);

CREATE INDEX crt_company_pack_questions_pack_sort_idx
  ON public.crt_company_pack_questions (pack_id, sort_order);

-- ─── Attempts ───────────────────────────────────────────────────────────────

CREATE TABLE public.crt_company_pack_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_id uuid NOT NULL REFERENCES public.crt_company_packs(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  score numeric,
  max_score numeric,
  CONSTRAINT crt_company_pack_attempts_score_check CHECK (score IS NULL OR score >= 0),
  CONSTRAINT crt_company_pack_attempts_max_score_check CHECK (max_score IS NULL OR max_score >= 0),
  CONSTRAINT crt_company_pack_attempts_score_within_max_check CHECK (
    score IS NULL OR max_score IS NULL OR score <= max_score
  ),
  CONSTRAINT crt_company_pack_attempts_status_time_check CHECK (
    (status = 'in_progress' AND submitted_at IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL)
  )
);

CREATE INDEX crt_company_pack_attempts_user_id_idx
  ON public.crt_company_pack_attempts (user_id, started_at DESC);

CREATE INDEX crt_company_pack_attempts_pack_id_idx
  ON public.crt_company_pack_attempts (pack_id);

CREATE TABLE public.crt_company_pack_attempt_questions (
  attempt_id uuid NOT NULL REFERENCES public.crt_company_pack_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.crt_questions(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (attempt_id, question_id),
  CONSTRAINT crt_company_pack_attempt_questions_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX crt_company_pack_attempt_questions_question_id_idx
  ON public.crt_company_pack_attempt_questions (question_id);

CREATE TABLE public.crt_company_pack_attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.crt_company_pack_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.crt_questions(id) ON DELETE RESTRICT,
  selected_index integer,
  is_correct boolean,
  answered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crt_company_pack_attempt_answers_unique UNIQUE (attempt_id, question_id),
  CONSTRAINT crt_company_pack_attempt_answers_selected_index_check CHECK (
    selected_index IS NULL OR selected_index BETWEEN 0 AND 3
  )
);

CREATE INDEX crt_company_pack_attempt_answers_attempt_id_idx
  ON public.crt_company_pack_attempt_answers (attempt_id);

DROP TRIGGER IF EXISTS crt_company_packs_updated_at ON public.crt_company_packs;
CREATE TRIGGER crt_company_packs_updated_at
  BEFORE UPDATE ON public.crt_company_packs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_content_updated_at();

-- ─── Guards ─────────────────────────────────────────────────────────────────
-- These read crt_company_pack_private.grading_authorizations.
-- They do not replace crt_attempt_lifecycle or crt_attempt_answer_guard
-- and they do not consult crt.grading.

CREATE OR REPLACE FUNCTION public.crt_company_pack_attempt_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_id uuid;
  v_is_grading boolean := false;
  v_student boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_attempt_id := OLD.id;
  ELSE
    v_attempt_id := NEW.id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM crt_company_pack_private.grading_authorizations AS ga
    WHERE ga.transaction_id = txid_current()
      AND ga.backend_pid = pg_backend_pid()
      AND ga.attempt_id = v_attempt_id
  )
  INTO v_is_grading;

  v_student := COALESCE(auth.role(), '') = 'authenticated' AND NOT v_is_grading;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'in_progress'
       OR NEW.submitted_at IS NOT NULL
       OR NEW.score IS NOT NULL
       OR NEW.max_score IS NOT NULL THEN
      RAISE EXCEPTION 'Company pack attempts must start in progress';
    END IF;

    IF v_student AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Students can only start their own company pack attempts';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_student AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Students cannot delete company pack attempts';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.pack_id IS DISTINCT FROM OLD.pack_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Company pack attempt ownership cannot change';
  END IF;

  IF OLD.status = 'submitted' THEN
    RAISE EXCEPTION 'Submitted company pack attempts cannot be changed';
  END IF;

  IF v_student THEN
    RAISE EXCEPTION 'Students cannot change company pack attempts directly';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crt_company_pack_attempt_question_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_id uuid;
  v_is_grading boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_attempt_id := OLD.attempt_id;
  ELSE
    v_attempt_id := NEW.attempt_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM crt_company_pack_private.grading_authorizations AS ga
    WHERE ga.transaction_id = txid_current()
      AND ga.backend_pid = pg_backend_pid()
      AND ga.attempt_id = v_attempt_id
  )
  INTO v_is_grading;

  IF COALESCE(auth.role(), '') = 'authenticated' AND NOT v_is_grading
     AND (TG_OP <> 'DELETE' OR NOT public.is_admin()) THEN
    RAISE EXCEPTION 'Company pack question snapshots cannot be changed directly';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crt_company_pack_answer_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_id uuid;
  v_is_grading boolean := false;
  v_student boolean;
  v_attempt public.crt_company_pack_attempts%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_attempt_id := OLD.attempt_id;
  ELSE
    v_attempt_id := NEW.attempt_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM crt_company_pack_private.grading_authorizations AS ga
    WHERE ga.transaction_id = txid_current()
      AND ga.backend_pid = pg_backend_pid()
      AND ga.attempt_id = v_attempt_id
  )
  INTO v_is_grading;

  v_student := COALESCE(auth.role(), '') = 'authenticated' AND NOT v_is_grading;

  -- One locked read. A missing row is the parent-delete cascade, not a race
  -- between an unlocked existence check and a later lock.
  SELECT *
    INTO v_attempt
  FROM public.crt_company_pack_attempts
  WHERE id = v_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      IF v_student AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Students cannot delete company pack answers';
      END IF;
      RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Company pack attempt does not exist';
  END IF;

  IF TG_OP <> 'DELETE' AND v_attempt.status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'Answers on a submitted company pack attempt cannot be changed';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_student AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Students cannot delete company pack answers';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crt_company_pack_attempt_questions AS snapshot
    WHERE snapshot.attempt_id = v_attempt_id
      AND snapshot.question_id = NEW.question_id
  ) THEN
    RAISE EXCEPTION 'Question is not in this company pack attempt';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
       OR NEW.question_id IS DISTINCT FROM OLD.question_id THEN
      RAISE EXCEPTION 'Company pack answer identity cannot change';
    END IF;
  END IF;

  IF v_student AND (
    NEW.is_correct IS NOT NULL
    OR v_attempt.status IS DISTINCT FROM 'in_progress'
    OR (TG_OP = 'UPDATE' AND NEW.is_correct IS DISTINCT FROM OLD.is_correct)
  ) THEN
    RAISE EXCEPTION 'Students cannot set company pack answer grades';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crt_company_pack_question_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_low uuid;
  v_high uuid;
  v_pack uuid;
BEGIN
  -- Parent pack first, so start's pack lock serializes with these writes.
  IF TG_OP = 'UPDATE' AND OLD.pack_id IS DISTINCT FROM NEW.pack_id THEN
    IF OLD.pack_id < NEW.pack_id THEN
      v_low := OLD.pack_id;
      v_high := NEW.pack_id;
    ELSE
      v_low := NEW.pack_id;
      v_high := OLD.pack_id;
    END IF;

    PERFORM 1
    FROM public.crt_company_packs
    WHERE id = v_low
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Company pack not found';
    END IF;

    PERFORM 1
    FROM public.crt_company_packs
    WHERE id = v_high
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Company pack not found';
    END IF;
  ELSE
    v_pack := CASE WHEN TG_OP = 'DELETE' THEN OLD.pack_id ELSE NEW.pack_id END;

    PERFORM 1
    FROM public.crt_company_packs
    WHERE id = v_pack
    FOR UPDATE;

    -- A pack delete already holds this row and then cascades to its links.
    -- That parent row is no longer visible, so a missing pack on DELETE is the
    -- cascade. Insert and update still require the pack row.
    IF NOT FOUND AND TG_OP <> 'DELETE' THEN
      RAISE EXCEPTION 'Company pack not found';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crt_company_pack_attempts_guard ON public.crt_company_pack_attempts;
CREATE TRIGGER crt_company_pack_attempts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.crt_company_pack_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.crt_company_pack_attempt_guard();

DROP TRIGGER IF EXISTS crt_company_pack_attempt_questions_guard
  ON public.crt_company_pack_attempt_questions;
CREATE TRIGGER crt_company_pack_attempt_questions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.crt_company_pack_attempt_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.crt_company_pack_attempt_question_guard();

DROP TRIGGER IF EXISTS crt_company_pack_questions_link_guard
  ON public.crt_company_pack_questions;
CREATE TRIGGER crt_company_pack_questions_link_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.crt_company_pack_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.crt_company_pack_question_link_guard();

DROP TRIGGER IF EXISTS crt_company_pack_attempt_answers_guard
  ON public.crt_company_pack_attempt_answers;
CREATE TRIGGER crt_company_pack_attempt_answers_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.crt_company_pack_attempt_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.crt_company_pack_answer_guard();

REVOKE ALL ON FUNCTION public.crt_company_pack_attempt_guard()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crt_company_pack_attempt_question_guard()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crt_company_pack_answer_guard()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crt_company_pack_question_link_guard()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.crt_company_pack_attempt_guard()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crt_company_pack_attempt_question_guard()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crt_company_pack_answer_guard()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crt_company_pack_question_link_guard()
  TO authenticated, service_role;

-- ─── Grants and RLS ─────────────────────────────────────────────────────────

REVOKE ALL ON TABLE public.crt_company_packs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crt_company_pack_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crt_company_pack_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crt_company_pack_attempt_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crt_company_pack_attempt_answers FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON TABLE public.crt_company_pack_attempt_answers FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crt_company_packs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crt_company_pack_questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crt_company_pack_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crt_company_pack_attempt_questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crt_company_pack_attempt_answers TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crt_company_packs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crt_company_pack_questions TO authenticated;
GRANT SELECT ON TABLE public.crt_company_pack_attempts TO authenticated;
GRANT SELECT ON TABLE public.crt_company_pack_attempt_questions TO authenticated;
GRANT SELECT (
  id, attempt_id, question_id, selected_index, is_correct, answered_at
), INSERT (
  attempt_id, question_id, selected_index, answered_at
), UPDATE (
  selected_index, answered_at
) ON TABLE public.crt_company_pack_attempt_answers TO authenticated;

ALTER TABLE public.crt_company_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crt_company_pack_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crt_company_pack_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crt_company_pack_attempt_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crt_company_pack_attempt_answers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.crt_company_packs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.crt_company_pack_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.crt_company_pack_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.crt_company_pack_attempt_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.crt_company_pack_attempt_answers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage crt company packs" ON public.crt_company_packs;
CREATE POLICY "Admins manage crt company packs" ON public.crt_company_packs
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Students read published crt company packs" ON public.crt_company_packs;
CREATE POLICY "Students read published crt company packs" ON public.crt_company_packs
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND (SELECT public.has_permission('crt.access'))
  );

DROP POLICY IF EXISTS "Admins manage crt company pack questions" ON public.crt_company_pack_questions;
CREATE POLICY "Admins manage crt company pack questions" ON public.crt_company_pack_questions
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Students read published crt company pack questions" ON public.crt_company_pack_questions;
CREATE POLICY "Students read published crt company pack questions" ON public.crt_company_pack_questions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_permission('crt.access'))
    AND EXISTS (
      SELECT 1
      FROM public.crt_company_packs AS pack
      WHERE pack.id = pack_id
        AND pack.status = 'published'
    )
  );

DROP POLICY IF EXISTS "Admins read crt company pack attempts" ON public.crt_company_pack_attempts;
CREATE POLICY "Admins read crt company pack attempts" ON public.crt_company_pack_attempts
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Students read own crt company pack attempts" ON public.crt_company_pack_attempts;
CREATE POLICY "Students read own crt company pack attempts" ON public.crt_company_pack_attempts
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (SELECT public.has_permission('crt.access'))
  );

DROP POLICY IF EXISTS "Admins read crt company pack attempt questions"
  ON public.crt_company_pack_attempt_questions;
CREATE POLICY "Admins read crt company pack attempt questions"
  ON public.crt_company_pack_attempt_questions
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Students read own crt company pack attempt questions"
  ON public.crt_company_pack_attempt_questions;
CREATE POLICY "Students read own crt company pack attempt questions"
  ON public.crt_company_pack_attempt_questions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_permission('crt.access'))
    AND EXISTS (
      SELECT 1
      FROM public.crt_company_pack_attempts AS attempt
      WHERE attempt.id = attempt_id
        AND attempt.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins read crt company pack attempt answers"
  ON public.crt_company_pack_attempt_answers;
CREATE POLICY "Admins read crt company pack attempt answers"
  ON public.crt_company_pack_attempt_answers
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Students read own crt company pack attempt answers"
  ON public.crt_company_pack_attempt_answers;
CREATE POLICY "Students read own crt company pack attempt answers"
  ON public.crt_company_pack_attempt_answers
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_permission('crt.access'))
    AND EXISTS (
      SELECT 1
      FROM public.crt_company_pack_attempts AS attempt
      WHERE attempt.id = attempt_id
        AND attempt.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Students insert own in-progress crt company pack answers"
  ON public.crt_company_pack_attempt_answers;
CREATE POLICY "Students insert own in-progress crt company pack answers"
  ON public.crt_company_pack_attempt_answers
  FOR INSERT TO authenticated
  WITH CHECK (
    is_correct IS NULL
    AND (SELECT public.has_permission('crt.access'))
    AND EXISTS (
      SELECT 1
      FROM public.crt_company_pack_attempts AS attempt
      JOIN public.crt_company_pack_attempt_questions AS snapshot
        ON snapshot.attempt_id = attempt.id
       AND snapshot.question_id = crt_company_pack_attempt_answers.question_id
      WHERE attempt.id = attempt_id
        AND attempt.user_id = (SELECT auth.uid())
        AND attempt.status = 'in_progress'
    )
  );

DROP POLICY IF EXISTS "Students update own in-progress crt company pack answers"
  ON public.crt_company_pack_attempt_answers;
CREATE POLICY "Students update own in-progress crt company pack answers"
  ON public.crt_company_pack_attempt_answers
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_permission('crt.access'))
    AND EXISTS (
      SELECT 1
      FROM public.crt_company_pack_attempts AS attempt
      WHERE attempt.id = attempt_id
        AND attempt.user_id = (SELECT auth.uid())
        AND attempt.status = 'in_progress'
    )
  )
  WITH CHECK (
    is_correct IS NULL
    AND (SELECT public.has_permission('crt.access'))
    AND EXISTS (
      SELECT 1
      FROM public.crt_company_pack_attempts AS attempt
      JOIN public.crt_company_pack_attempt_questions AS snapshot
        ON snapshot.attempt_id = attempt.id
       AND snapshot.question_id = crt_company_pack_attempt_answers.question_id
      WHERE attempt.id = attempt_id
        AND attempt.user_id = (SELECT auth.uid())
        AND attempt.status = 'in_progress'
    )
  );

-- ─── Start, read, and submit ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crt_start_company_pack_attempt(target_pack uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_attempt uuid;
  v_status text;
  v_count integer;
  v_copied bigint;
BEGIN
  IF v_user IS NULL OR NOT public.has_permission('crt.access') THEN
    RAISE EXCEPTION 'CRT access required';
  END IF;

  -- Hold the pack until this transaction ends. Question-link writes take this
  -- same lock in their trigger before changing any link row.
  SELECT status
    INTO v_status
  FROM public.crt_company_packs
  WHERE id = target_pack
  FOR UPDATE;

  IF NOT FOUND OR v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'Published company pack not found';
  END IF;

  SELECT COUNT(*)
    INTO v_count
  FROM public.crt_company_pack_questions
  WHERE pack_id = target_pack;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Company pack has no questions';
  END IF;

  INSERT INTO public.crt_company_pack_attempts (user_id, pack_id, status)
  VALUES (v_user, target_pack, 'in_progress')
  RETURNING id INTO v_attempt;

  INSERT INTO crt_company_pack_private.grading_authorizations (
    transaction_id,
    backend_pid,
    attempt_id
  )
  VALUES (
    txid_current(),
    pg_backend_pid(),
    v_attempt
  );

  INSERT INTO public.crt_company_pack_attempt_questions (
    attempt_id,
    question_id,
    sort_order
  )
  SELECT v_attempt, question_id, sort_order
  FROM public.crt_company_pack_questions
  WHERE pack_id = target_pack;

  GET DIAGNOSTICS v_copied = ROW_COUNT;
  IF v_copied = 0 OR v_copied <> v_count THEN
    RAISE EXCEPTION 'Company pack snapshot could not be copied';
  END IF;

  DELETE FROM crt_company_pack_private.grading_authorizations
  WHERE transaction_id = txid_current()
    AND backend_pid = pg_backend_pid()
    AND attempt_id = v_attempt;

  RETURN v_attempt;
END;
$$;

CREATE OR REPLACE FUNCTION public.crt_get_company_pack_questions(target_attempt uuid)
RETURNS TABLE (
  question_id uuid,
  stem text,
  options jsonb,
  topic text,
  difficulty text,
  sort_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT public.has_permission('crt.access') THEN
    RAISE EXCEPTION 'CRT access required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crt_company_pack_attempts AS attempt
    WHERE attempt.id = target_attempt
      AND attempt.user_id = v_user
      AND attempt.status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'In-progress company pack attempt not found';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.stem,
    q.options,
    q.topic,
    q.difficulty,
    snapshot.sort_order
  FROM public.crt_company_pack_attempt_questions AS snapshot
  JOIN public.crt_questions AS q ON q.id = snapshot.question_id
  WHERE snapshot.attempt_id = target_attempt
  ORDER BY snapshot.sort_order, q.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crt_submit_company_pack_attempt(target_attempt uuid)
RETURNS TABLE (attempt_score numeric, attempt_max_score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_score numeric;
  v_max numeric;
BEGIN
  IF v_user IS NULL OR NOT public.has_permission('crt.access') THEN
    RAISE EXCEPTION 'CRT access required';
  END IF;

  PERFORM 1
  FROM public.crt_company_pack_attempts
  WHERE id = target_attempt
    AND user_id = v_user
    AND status = 'in_progress'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'In-progress company pack attempt not found';
  END IF;

  SELECT COUNT(*)
    INTO v_max
  FROM public.crt_company_pack_attempt_questions
  WHERE attempt_id = target_attempt;

  IF v_max = 0 THEN
    RAISE EXCEPTION 'Company pack attempt has no questions';
  END IF;

  INSERT INTO crt_company_pack_private.grading_authorizations (
    transaction_id,
    backend_pid,
    attempt_id
  )
  VALUES (
    txid_current(),
    pg_backend_pid(),
    target_attempt
  );

  UPDATE public.crt_company_pack_attempt_answers AS ans
  SET is_correct = (
    ans.selected_index IS NOT NULL
    AND ans.selected_index = q.correct_index
  )
  FROM public.crt_company_pack_attempt_questions AS snapshot
  JOIN public.crt_questions AS q ON q.id = snapshot.question_id
  WHERE ans.attempt_id = target_attempt
    AND snapshot.attempt_id = target_attempt
    AND snapshot.question_id = ans.question_id;

  SELECT COUNT(*)
    INTO v_score
  FROM public.crt_company_pack_attempt_answers AS ans
  JOIN public.crt_company_pack_attempt_questions AS snapshot
    ON snapshot.attempt_id = ans.attempt_id
   AND snapshot.question_id = ans.question_id
  WHERE ans.attempt_id = target_attempt
    AND ans.is_correct IS TRUE;

  UPDATE public.crt_company_pack_attempts
  SET status = 'submitted',
      submitted_at = clock_timestamp(),
      score = v_score,
      max_score = v_max
  WHERE id = target_attempt
    AND user_id = v_user
    AND status = 'in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company pack attempt could not be submitted';
  END IF;

  DELETE FROM crt_company_pack_private.grading_authorizations
  WHERE transaction_id = txid_current()
    AND backend_pid = pg_backend_pid()
    AND attempt_id = target_attempt;

  attempt_score := v_score;
  attempt_max_score := v_max;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.crt_start_company_pack_attempt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crt_get_company_pack_questions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crt_submit_company_pack_attempt(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.crt_start_company_pack_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crt_get_company_pack_questions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crt_submit_company_pack_attempt(uuid) TO authenticated;

COMMIT;
