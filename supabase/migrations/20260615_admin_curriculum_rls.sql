-- Admin CRUD policies for curriculum, lessons, and content blocks

ALTER TABLE public.course_curriculum ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_blocks ENABLE ROW LEVEL SECURITY;

-- course_curriculum: public read already exists; add admin write
DROP POLICY IF EXISTS "Admin insert curriculum" ON public.course_curriculum;
CREATE POLICY "Admin insert curriculum" ON public.course_curriculum
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin update curriculum" ON public.course_curriculum;
CREATE POLICY "Admin update curriculum" ON public.course_curriculum
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin delete curriculum" ON public.course_curriculum;
CREATE POLICY "Admin delete curriculum" ON public.course_curriculum
  FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin read all curriculum" ON public.course_curriculum;
CREATE POLICY "Admin read all curriculum" ON public.course_curriculum
  FOR SELECT TO authenticated
  USING (public.is_admin() OR true);

-- course_lessons: public read already exists; add admin write
DROP POLICY IF EXISTS "Admin insert lessons" ON public.course_lessons;
CREATE POLICY "Admin insert lessons" ON public.course_lessons
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin update lessons" ON public.course_lessons;
CREATE POLICY "Admin update lessons" ON public.course_lessons
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin delete lessons" ON public.course_lessons;
CREATE POLICY "Admin delete lessons" ON public.course_lessons
  FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin read all lessons" ON public.course_lessons;
CREATE POLICY "Admin read all lessons" ON public.course_lessons
  FOR SELECT TO authenticated
  USING (public.is_admin() OR true);

-- content_blocks: public read + admin CRUD
DROP POLICY IF EXISTS "Public read content blocks" ON public.content_blocks;
CREATE POLICY "Public read content blocks" ON public.content_blocks
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Admin insert content blocks" ON public.content_blocks;
CREATE POLICY "Admin insert content blocks" ON public.content_blocks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin update content blocks" ON public.content_blocks;
CREATE POLICY "Admin update content blocks" ON public.content_blocks
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin delete content blocks" ON public.content_blocks;
CREATE POLICY "Admin delete content blocks" ON public.content_blocks
  FOR DELETE TO authenticated
  USING (public.is_admin());
