-- Blogs + blog images + storage bucket

CREATE TABLE public.blogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  summary text,
  content text NOT NULL,
  cover_image_url text,
  event_date date,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.blog_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id uuid NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  url text NOT NULL,
  caption text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX blog_images_blog_id_idx ON public.blog_images(blog_id);
CREATE INDEX blogs_status_event_date_idx ON public.blogs(status, event_date DESC);

CREATE OR REPLACE FUNCTION public.set_blogs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER blogs_updated_at
  BEFORE UPDATE ON public.blogs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_blogs_updated_at();

ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published blogs" ON public.blogs
  FOR SELECT TO public
  USING (status = 'published' OR public.is_admin());

CREATE POLICY "Admin insert blogs" ON public.blogs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin update blogs" ON public.blogs
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin delete blogs" ON public.blogs
  FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "Public read blog images for published blogs" ON public.blog_images
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.blogs b
      WHERE b.id = blog_id AND (b.status = 'published' OR public.is_admin())
    )
  );

CREATE POLICY "Admin insert blog images" ON public.blog_images
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin update blog images" ON public.blog_images
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin delete blog images" ON public.blog_images
  FOR DELETE TO authenticated
  USING (public.is_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read blog images bucket" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'blog-images');

CREATE POLICY "Admin upload blog images bucket" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'blog-images' AND public.is_admin());

CREATE POLICY "Admin update blog images bucket" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'blog-images' AND public.is_admin());

CREATE POLICY "Admin delete blog images bucket" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'blog-images' AND public.is_admin());

INSERT INTO public.blogs (slug, title, summary, content, event_date, status)
VALUES
(
  'ulearn-signs-mou-vignan-university',
  'ULearn Signs MOU with Vignan University',
  'A strategic partnership to expand joint programs, research collaboration, and industry-ready learning pathways for students across Andhra Pradesh.',
  E'ULearn is proud to announce the signing of a Memorandum of Understanding (MOU) with Vignan University, marking a significant milestone in our mission to bridge academic excellence with industry-ready skills.\n\nThis partnership establishes a framework for:\n\n• Joint certificate and diploma programs in emerging technologies\n• Faculty development and mentor exchange programs\n• Research collaboration in AI, data science, and software engineering\n• Internship pipelines connecting Vignan students with ULearn industry partners\n• Shared access to labs, workshops, and live masterclasses\n\nThrough this MOU, students at Vignan University will gain structured pathways into ULearn''s technical, creative, and business courses — with credit recognition where applicable and dedicated cohort support.\n\nLeadership from both institutions emphasized a shared vision: making high-quality, outcome-focused education accessible to learners who aspire to build real-world projects and careers in technology.\n\nStay tuned for upcoming joint bootcamps, research showcases, and enrollment windows exclusively for the Vignan community.',
  '2025-11-15',
  'published'
),
(
  'vignan-mou-signing-ceremony-highlights',
  'Vignan MOU Signing Ceremony Highlights',
  'Recap of the formal signing event — keynote speakers, dignitaries present, and the outcomes agreed upon for the ULearn–Vignan partnership.',
  E'The ULearn and Vignan University MOU signing ceremony brought together academic leaders, industry mentors, and student representatives for an afternoon dedicated to the future of collaborative learning.\n\nCeremony highlights:\n\n• Welcome address outlining ULearn''s platform vision and learner outcomes\n• Keynote from Vignan leadership on innovation, research, and graduate employability\n• Formal MOU exchange and photo session with institutional delegates\n• Panel discussion on AI literacy, internship readiness, and interdisciplinary projects\n• Student Q&A on new joint programs, scholarships, and research opportunities\n\nOutcomes confirmed at the event:\n\n1. Launch of a pilot cohort for full-stack and AI/ML tracks in the upcoming academic term\n2. Establishment of a co-branded innovation lab for capstone and research projects\n3. Quarterly mentor meetups open to students from both institutions\n4. A dedicated liaison team to coordinate enrollments, events, and progress reporting\n\nPhotographs from the ceremony will be published here soon. Administrators can upload event photos from the admin panel.',
  '2025-11-16',
  'published'
);
