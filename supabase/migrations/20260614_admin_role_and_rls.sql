-- Admin role on profiles + RLS for admin course management

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'USER'
  CHECK (role IN ('USER', 'ADMIN'));

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
  OR COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'ADMIN';
$$;

-- Courses: enable RLS if not already
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published courses" ON public.courses;
CREATE POLICY "Public read published courses" ON public.courses
  FOR SELECT TO public
  USING (status = 'published' OR public.is_admin());

DROP POLICY IF EXISTS "Admin insert courses" ON public.courses;
CREATE POLICY "Admin insert courses" ON public.courses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin update courses" ON public.courses;
CREATE POLICY "Admin update courses" ON public.courses
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin delete courses" ON public.courses;
CREATE POLICY "Admin delete courses" ON public.courses
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Admins can read all profiles (for dashboard student count)
DROP POLICY IF EXISTS "Admin read all profiles" ON public.profiles;
CREATE POLICY "Admin read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin() OR auth.uid() = id);

-- Admins can read all enrollments
DROP POLICY IF EXISTS "Admin read all enrollments" ON public.enrollments;
CREATE POLICY "Admin read all enrollments" ON public.enrollments
  FOR SELECT TO authenticated
  USING (public.is_admin() OR auth.uid() = user_id);
