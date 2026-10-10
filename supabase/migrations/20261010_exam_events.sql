-- Group exams under a college, a batch, or Others.
-- Students are locked into the exam dashboard only while enrolled in an Active event.

CREATE TABLE IF NOT EXISTS public.exam_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('college', 'batch', 'other')),
  title text NOT NULL,
  college_name text,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_events_window_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_exam_events_status ON public.exam_events (status);

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.exam_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exams_event ON public.exams (event_id);

ALTER TABLE public.exam_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage exam events" ON public.exam_events;
CREATE POLICY "Admin manage exam events" ON public.exam_events
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Candidates read own exam events" ON public.exam_events;
CREATE POLICY "Candidates read own exam events" ON public.exam_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exams e
      JOIN public.exam_candidates c ON c.exam_id = e.id
      WHERE e.event_id = exam_events.id
        AND c.user_id = auth.uid()
    )
  );

DO $$
DECLARE
  v_id uuid;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  SELECT id INTO v_id
  FROM public.exam_events
  WHERE kind = 'other' AND title = 'Others'
  LIMIT 1;

  IF v_id IS NULL THEN
    SELECT MIN(starts_at), MAX(ends_at) INTO v_start, v_end FROM public.exams;
    IF v_start IS NULL THEN
      v_start := now();
      v_end := now() + interval '1 day';
    END IF;
    IF v_end <= v_start THEN
      v_end := v_start + interval '1 hour';
    END IF;

    INSERT INTO public.exam_events (kind, title, starts_at, ends_at, status)
    VALUES ('other', 'Others', v_start, v_end, 'completed')
    RETURNING id INTO v_id;
  END IF;

  UPDATE public.exams
  SET event_id = v_id,
      status = 'closed',
      updated_at = now()
  WHERE event_id IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.user_has_active_exam()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_candidates c
    JOIN public.exams e ON e.id = c.exam_id
    JOIN public.exam_events ev ON ev.id = e.event_id
    WHERE c.user_id = auth.uid()
      AND ev.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_active_exam() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_active_exam() TO authenticated, service_role;

UPDATE public.profiles p
SET exam_only = false,
    updated_at = now()
WHERE p.exam_only = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.exam_candidates c
    JOIN public.exams e ON e.id = c.exam_id
    JOIN public.exam_events ev ON ev.id = e.event_id
    WHERE c.user_id = p.id
      AND ev.status = 'active'
  );

CREATE OR REPLACE FUNCTION public.exam_status_for_event(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'active' THEN 'published'
    WHEN 'completed' THEN 'closed'
    ELSE 'draft'
  END;
$$;

CREATE OR REPLACE FUNCTION public.create_exam_event(
  p_kind text,
  p_title text,
  p_college_name text,
  p_batch_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event uuid;
  v_exam uuid;
  v_role uuid;
  v_src_exam uuid;
  v_src_role uuid;
  r record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_kind NOT IN ('college', 'batch') THEN
    RAISE EXCEPTION 'Choose a college or a batch';
  END IF;
  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'End time must be after the start time';
  END IF;
  IF length(trim(coalesce(p_title, ''))) = 0 THEN
    RAISE EXCEPTION 'Enter a name';
  END IF;

  INSERT INTO public.exam_events (
    kind, title, college_name, batch_id, starts_at, ends_at, status, created_by
  )
  VALUES (
    p_kind,
    trim(p_title),
    NULLIF(trim(coalesce(p_college_name, '')), ''),
    p_batch_id,
    p_starts_at,
    p_ends_at,
    'draft',
    auth.uid()
  )
  RETURNING id INTO v_event;

  FOR r IN
    SELECT * FROM (VALUES
      ('business-development-executive', 'Business Development Executive — Assessment', 'Business Development Executive', 60, false, 1),
      ('research-analyst', 'Research Analyst — Assessment', 'Research Analyst', 90, true, 2),
      ('associate-lead-generation-specialist', 'Associate Lead Generation Specialist — Assessment', 'Associate Lead Generation Specialist', 60, false, 3),
      ('relationship-executive', 'Relationship Executive — Assessment', 'Relationship Executive', 60, false, 4),
      ('junior-full-stack-developer', 'Junior Full-Stack Developer — Assessment', 'Junior Full-Stack Developer', 90, true, 5)
    ) AS t(slug, title, role_name, duration_min, has_coding, sort_order)
  LOOP
    SELECT id INTO v_src_exam
    FROM public.exams
    WHERE recruitment_slug = r.slug
    LIMIT 1;

    INSERT INTO public.exams (
      title, description, starts_at, ends_at, duration_minutes, max_concurrent,
      status, created_by, event_id
    )
    VALUES (
      r.title,
      'Copied from the recruitment papers',
      p_starts_at,
      p_ends_at,
      r.duration_min,
      1000,
      'draft',
      auth.uid(),
      v_event
    )
    RETURNING id INTO v_exam;

    INSERT INTO public.exam_roles (exam_id, name, slug, has_coding, sort_order)
    VALUES (v_exam, r.role_name, r.slug, r.has_coding, r.sort_order)
    RETURNING id INTO v_role;

    IF v_src_exam IS NOT NULL THEN
      SELECT id INTO v_src_role
      FROM public.exam_roles
      WHERE exam_id = v_src_exam AND slug = r.slug
      LIMIT 1;

      IF v_src_role IS NOT NULL THEN
        INSERT INTO public.exam_questions (exam_role_id, type, sort_order, payload)
        SELECT v_role, type, sort_order, payload
        FROM public.exam_questions
        WHERE exam_role_id = v_src_role;
      END IF;
    END IF;
  END LOOP;

  RETURN v_event;
END;
$$;

REVOKE ALL ON FUNCTION public.create_exam_event(text, text, text, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_exam_event(text, text, text, uuid, timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_exam_event_role(
  p_event_id uuid,
  p_name text,
  p_has_coding boolean,
  p_duration integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.exam_events%ROWTYPE;
  v_exam uuid;
  v_slug text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF length(trim(coalesce(p_name, ''))) = 0 THEN
    RAISE EXCEPTION 'Enter a role name';
  END IF;
  IF p_duration IS NULL OR p_duration < 1 THEN
    RAISE EXCEPTION 'Enter a duration';
  END IF;

  SELECT * INTO v_event FROM public.exam_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Exam not found';
  END IF;

  v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'))
    || '-' || substr(md5(random()::text), 1, 4);

  INSERT INTO public.exams (
    title, description, starts_at, ends_at, duration_minutes, max_concurrent,
    status, created_by, event_id
  )
  VALUES (
    trim(p_name) || ' — Assessment',
    'Added role',
    v_event.starts_at,
    v_event.ends_at,
    p_duration,
    1000,
    public.exam_status_for_event(v_event.status),
    auth.uid(),
    p_event_id
  )
  RETURNING id INTO v_exam;

  INSERT INTO public.exam_roles (exam_id, name, slug, has_coding, sort_order)
  VALUES (
    v_exam,
    trim(p_name),
    v_slug,
    coalesce(p_has_coding, false),
    100
  );

  RETURN v_exam;
END;
$$;

REVOKE ALL ON FUNCTION public.add_exam_event_role(uuid, text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_exam_event_role(uuid, text, boolean, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_exam_event_status(p_event_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_status NOT IN ('draft', 'active', 'completed') THEN
    RAISE EXCEPTION 'Unknown status';
  END IF;

  UPDATE public.exam_events
  SET status = p_status,
      updated_at = now()
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam not found';
  END IF;

  UPDATE public.exams
  SET status = public.exam_status_for_event(p_status),
      updated_at = now()
  WHERE event_id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_exam_event_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_exam_event_status(uuid, text) TO authenticated, service_role;
