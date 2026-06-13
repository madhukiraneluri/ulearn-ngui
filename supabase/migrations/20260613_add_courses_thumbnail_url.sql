ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS thumbnail_url text;

UPDATE public.courses SET thumbnail_url = CASE slug
  WHEN 'intro-to-ml' THEN 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80'
  WHEN 'web-dev-101' THEN 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=80'
  WHEN 'research-methods' THEN 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80'
  ELSE thumbnail_url
END
WHERE thumbnail_url IS NULL;
