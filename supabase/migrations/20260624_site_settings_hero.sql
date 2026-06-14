-- Site-wide settings (home hero image, etc.)

CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_site_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_site_settings_updated_at();

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read site settings" ON public.site_settings
  FOR SELECT TO public
  USING (true);

CREATE POLICY "Admin insert site settings" ON public.site_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin update site settings" ON public.site_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin delete site settings" ON public.site_settings
  FOR DELETE TO authenticated
  USING (public.is_admin());

INSERT INTO public.site_settings (key, value)
VALUES ('home_hero_image_url', 'assets/images/students learning.png')
ON CONFLICT (key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'home-hero-images',
  'home-hero-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read home hero images" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'home-hero-images');

CREATE POLICY "Admin upload home hero images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'home-hero-images' AND public.is_admin());

CREATE POLICY "Admin update home hero images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'home-hero-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'home-hero-images' AND public.is_admin());

CREATE POLICY "Admin delete home hero images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'home-hero-images' AND public.is_admin());
