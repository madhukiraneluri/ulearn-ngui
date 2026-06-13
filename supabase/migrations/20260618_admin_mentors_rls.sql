-- Admin CRUD on course_mentors (public read policy already exists)

ALTER TABLE public.course_mentors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin insert mentors" ON public.course_mentors;
CREATE POLICY "Admin insert mentors" ON public.course_mentors
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin update mentors" ON public.course_mentors;
CREATE POLICY "Admin update mentors" ON public.course_mentors
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin delete mentors" ON public.course_mentors;
CREATE POLICY "Admin delete mentors" ON public.course_mentors
  FOR DELETE TO authenticated
  USING (public.is_admin());
