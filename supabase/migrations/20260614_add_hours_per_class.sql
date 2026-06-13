-- Add hours_per_class to courses and seed values for existing courses
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS hours_per_class numeric(4, 1);

COMMENT ON COLUMN public.courses.hours_per_class IS 'Duration of each class session in hours (e.g. 1.5, 2)';

UPDATE public.courses
SET hours_per_class = CASE slug
  WHEN 'intro-to-ml' THEN 2
  WHEN 'research-methods' THEN 2
  WHEN 'web-dev-101' THEN 1.5
  ELSE hours_per_class
END
WHERE slug IN ('intro-to-ml', 'research-methods', 'web-dev-101');
