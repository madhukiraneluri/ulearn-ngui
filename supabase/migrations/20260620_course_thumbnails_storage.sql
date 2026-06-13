-- Course thumbnail uploads (Supabase Storage)

INSERT INTO storage.buckets (id, name, public)
VALUES ('course-thumbnails', 'course-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read course thumbnails bucket" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'course-thumbnails');

CREATE POLICY "Admin upload course thumbnails bucket" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'course-thumbnails' AND public.is_admin());

CREATE POLICY "Admin update course thumbnails bucket" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'course-thumbnails' AND public.is_admin());

CREATE POLICY "Admin delete course thumbnails bucket" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'course-thumbnails' AND public.is_admin());
