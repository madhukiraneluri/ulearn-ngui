-- Recruitment suite: registrations, results, seeded role exams, Judge0-ready coding payloads

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS recruitment_slug text;

ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_recruitment_slug_key;
ALTER TABLE public.exams
  ADD CONSTRAINT exams_recruitment_slug_key UNIQUE (recruitment_slug);

-- ─── Excel import staging / registration log ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exam_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  role_interested text NOT NULL,
  role_slug text,
  exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  candidate_id uuid REFERENCES public.exam_candidates(id) ON DELETE SET NULL,
  import_batch_id uuid,
  credentials_sent_at timestamptz,
  provision_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_registrations_email_exam_unique UNIQUE (email, exam_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_registrations_exam ON public.exam_registrations (exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_registrations_role ON public.exam_registrations (role_slug);
CREATE INDEX IF NOT EXISTS idx_exam_registrations_batch ON public.exam_registrations (import_batch_id);

-- ─── Evaluated results (persisted after submit + Judge0) ───────────────────────

CREATE TABLE IF NOT EXISTS public.exam_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_slug text NOT NULL,
  student_name text NOT NULL,
  student_email text NOT NULL,
  mcq_score numeric NOT NULL DEFAULT 0,
  mcq_max numeric NOT NULL DEFAULT 0,
  coding_score numeric NOT NULL DEFAULT 0,
  coding_max numeric NOT NULL DEFAULT 0,
  total_score numeric NOT NULL DEFAULT 0,
  total_max numeric NOT NULL DEFAULT 0,
  percentage numeric NOT NULL DEFAULT 0,
  fullscreen_warnings integer NOT NULL DEFAULT 0,
  mcq_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  coding_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_results_exam ON public.exam_results (exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_role ON public.exam_results (role_slug);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.exam_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage exam registrations" ON public.exam_registrations;
CREATE POLICY "Admin manage exam registrations" ON public.exam_registrations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin manage exam results" ON public.exam_results;
CREATE POLICY "Admin manage exam results" ON public.exam_results
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Students read own results" ON public.exam_results;
CREATE POLICY "Students read own results" ON public.exam_results
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- ─── Seed 5 recruitment exams (tomorrow 10:00 AM IST window) ───────────────────

DO $$
DECLARE
  v_start timestamptz := '2026-09-22T04:30:00+00'::timestamptz;
  v_end timestamptz := '2026-09-22T14:30:00+00'::timestamptz;
  v_exam_id uuid;
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('business-development-executive', 'Business Development Executive — Assessment', 60, false),
      ('research-analyst', 'Research Analyst — Assessment', 90, true),
      ('associate-lead-generation-specialist', 'Associate Lead Generation Specialist — Assessment', 60, false),
      ('relationship-executive', 'Relationship Executive — Assessment', 60, false),
      ('junior-full-stack-developer', 'Junior Full-Stack Developer — Assessment', 90, true)
    ) AS t(slug, title, duration_min, has_coding)
  LOOP
    INSERT INTO public.exams (
      title, description, starts_at, ends_at, duration_minutes, max_concurrent,
      status, recruitment_slug
    )
    VALUES (
      r.title,
      'Recruitment assessment — MCQ' || CASE WHEN r.has_coding THEN ' + coding' ELSE '' END,
      v_start,
      v_end,
      r.duration_min,
      1000,
      'published',
      r.slug
    )
    ON CONFLICT (recruitment_slug) DO UPDATE SET
      title = EXCLUDED.title,
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      duration_minutes = EXCLUDED.duration_minutes,
      status = 'published',
      updated_at = now()
    RETURNING id INTO v_exam_id;

    IF v_exam_id IS NULL THEN
      SELECT id INTO v_exam_id FROM public.exams WHERE recruitment_slug = r.slug;
    END IF;

    INSERT INTO public.exam_roles (exam_id, name, slug, has_coding, sort_order)
    VALUES (
      v_exam_id,
      CASE r.slug
        WHEN 'business-development-executive' THEN 'Business Development Executive'
        WHEN 'research-analyst' THEN 'Research Analyst'
        WHEN 'associate-lead-generation-specialist' THEN 'Associate Lead Generation Specialist'
        WHEN 'relationship-executive' THEN 'Relationship Executive'
        WHEN 'junior-full-stack-developer' THEN 'Junior Full-Stack Developer'
        ELSE r.slug
      END,
      r.slug,
      r.has_coding,
      0
    )
    ON CONFLICT (exam_id, slug) DO UPDATE SET
      has_coding = EXCLUDED.has_coding,
      name = EXCLUDED.name;
  END LOOP;
END $$;
