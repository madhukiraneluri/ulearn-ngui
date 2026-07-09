-- Admin can delete student accounts and related progress

DROP POLICY IF EXISTS "Admin delete student profiles" ON public.profiles;
CREATE POLICY "Admin delete student profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND role NOT IN ('ADMIN', 'INSTRUCTOR')
  );

DROP POLICY IF EXISTS "Admin delete lesson progress" ON public.lesson_progress;
CREATE POLICY "Admin delete lesson progress" ON public.lesson_progress
  FOR DELETE TO authenticated
  USING (public.is_admin());
