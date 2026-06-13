-- Admin manual enrollment management

DROP POLICY IF EXISTS "Admin insert enrollments" ON public.enrollments;
CREATE POLICY "Admin insert enrollments" ON public.enrollments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin delete enrollments" ON public.enrollments;
CREATE POLICY "Admin delete enrollments" ON public.enrollments
  FOR DELETE TO authenticated
  USING (public.is_admin());
