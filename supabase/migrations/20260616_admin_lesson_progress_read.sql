-- Admins can read all lesson progress (for student dashboard)

DROP POLICY IF EXISTS "Admin read all lesson progress" ON public.lesson_progress;
CREATE POLICY "Admin read all lesson progress" ON public.lesson_progress
  FOR SELECT TO authenticated
  USING (public.is_admin() OR auth.uid() = user_id);
