-- Course content: public read, enrollments: user-owned
ALTER TABLE public.course_curriculum ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read curriculum" ON public.course_curriculum
  FOR SELECT TO public USING (true);

CREATE POLICY "Public read lessons" ON public.course_lessons
  FOR SELECT TO public USING (true);

CREATE POLICY "Public read mentors" ON public.course_mentors
  FOR SELECT TO public USING (true);

CREATE POLICY "Users read own enrollments" ON public.enrollments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own enrollments" ON public.enrollments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
