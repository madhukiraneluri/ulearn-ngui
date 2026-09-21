-- Exam portal: exams, roles, questions, candidates, attempts, proctoring slots

-- ─── Profile flag for exam-only users ────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS exam_only boolean NOT NULL DEFAULT false;

-- ─── Exams ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  max_concurrent integer NOT NULL DEFAULT 1000 CHECK (max_concurrent > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'closed')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exams_window_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_exams_status ON public.exams (status);
CREATE INDEX IF NOT EXISTS idx_exams_starts_at ON public.exams (starts_at);

-- ─── Exam roles (tracks / patterns) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exam_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  has_coding boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_roles_exam_slug_unique UNIQUE (exam_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_exam_roles_exam ON public.exam_roles (exam_id);

-- ─── Questions (static JSON payload) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_role_id uuid NOT NULL REFERENCES public.exam_roles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('mcq', 'coding')),
  sort_order integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_questions_role ON public.exam_questions (exam_role_id, sort_order);

-- ─── Registered candidates ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exam_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_role_id uuid NOT NULL REFERENCES public.exam_roles(id) ON DELETE RESTRICT,
  registered_at timestamptz NOT NULL DEFAULT now(),
  credentials_sent_at timestamptz,
  CONSTRAINT exam_candidates_exam_user_unique UNIQUE (exam_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_candidates_user ON public.exam_candidates (user_id);
CREATE INDEX IF NOT EXISTS idx_exam_candidates_exam ON public.exam_candidates (exam_id);

-- ─── Attempts ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  exam_role_id uuid NOT NULL REFERENCES public.exam_roles(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'auto_submitted', 'blocked')),
  fullscreen_exit_count integer NOT NULL DEFAULT 0,
  proctoring_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_user ON public.exam_attempts (user_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON public.exam_attempts (exam_id);

-- ─── Answers ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exam_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  answer jsonb NOT NULL DEFAULT '{}'::jsonb,
  answered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_answers_attempt_question_unique UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_answers_attempt ON public.exam_answers (attempt_id);

-- ─── Active slots (concurrency cap) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exam_active_slots (
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exam_id, attempt_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_active_slots_exam ON public.exam_active_slots (exam_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_active_slots ENABLE ROW LEVEL SECURITY;

-- exams
DROP POLICY IF EXISTS "Admin manage exams" ON public.exams;
CREATE POLICY "Admin manage exams" ON public.exams
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Candidates read assigned exams" ON public.exams;
CREATE POLICY "Candidates read assigned exams" ON public.exams
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.exam_candidates ec
      WHERE ec.exam_id = exams.id AND ec.user_id = auth.uid()
    )
  );

-- exam_roles
DROP POLICY IF EXISTS "Admin manage exam roles" ON public.exam_roles;
CREATE POLICY "Admin manage exam roles" ON public.exam_roles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Candidates read own exam roles" ON public.exam_roles;
CREATE POLICY "Candidates read own exam roles" ON public.exam_roles
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.exam_candidates ec
      WHERE ec.exam_id = exam_roles.exam_id
        AND ec.exam_role_id = exam_roles.id
        AND ec.user_id = auth.uid()
    )
  );

-- exam_questions (no correct answers exposed to candidates via separate view later)
DROP POLICY IF EXISTS "Admin manage exam questions" ON public.exam_questions;
CREATE POLICY "Admin manage exam questions" ON public.exam_questions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Candidates read questions during attempt" ON public.exam_questions;
CREATE POLICY "Candidates read questions during attempt" ON public.exam_questions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.exam_attempts ea
      JOIN public.exam_roles er ON er.id = ea.exam_role_id
      WHERE ea.user_id = auth.uid()
        AND ea.status = 'in_progress'
        AND er.id = exam_questions.exam_role_id
    )
  );

-- exam_candidates
DROP POLICY IF EXISTS "Admin manage exam candidates" ON public.exam_candidates;
CREATE POLICY "Admin manage exam candidates" ON public.exam_candidates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users read own candidacy" ON public.exam_candidates;
CREATE POLICY "Users read own candidacy" ON public.exam_candidates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- exam_attempts
DROP POLICY IF EXISTS "Admin manage exam attempts" ON public.exam_attempts;
CREATE POLICY "Admin manage exam attempts" ON public.exam_attempts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users manage own attempts" ON public.exam_attempts;
CREATE POLICY "Users manage own attempts" ON public.exam_attempts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- exam_answers
DROP POLICY IF EXISTS "Admin read all answers" ON public.exam_answers;
CREATE POLICY "Admin read all answers" ON public.exam_answers
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users manage own answers" ON public.exam_answers;
CREATE POLICY "Users manage own answers" ON public.exam_answers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id = exam_answers.attempt_id
        AND ea.user_id = auth.uid()
        AND ea.status = 'in_progress'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id = exam_answers.attempt_id
        AND ea.user_id = auth.uid()
        AND ea.status = 'in_progress'
    )
  );

-- exam_active_slots
DROP POLICY IF EXISTS "Admin manage exam slots" ON public.exam_active_slots;
CREATE POLICY "Admin manage exam slots" ON public.exam_active_slots
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users read own slots" ON public.exam_active_slots;
CREATE POLICY "Users read own slots" ON public.exam_active_slots
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users insert own slots" ON public.exam_active_slots;
CREATE POLICY "Users insert own slots" ON public.exam_active_slots
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own slots" ON public.exam_active_slots;
CREATE POLICY "Users delete own slots" ON public.exam_active_slots
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── Storage bucket for proctoring clips ─────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exam-proctoring',
  'exam-proctoring',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'video/webm', 'video/mp4']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Candidates upload own proctoring files" ON storage.objects;
CREATE POLICY "Candidates upload own proctoring files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'exam-proctoring'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Candidates read own proctoring files" ON storage.objects;
CREATE POLICY "Candidates read own proctoring files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'exam-proctoring'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Admin read all proctoring files" ON storage.objects;
CREATE POLICY "Admin read all proctoring files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'exam-proctoring' AND public.is_admin());
