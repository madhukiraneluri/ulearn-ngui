-- Store email on profiles for admin bulk enrollment lookup

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR trim(p.email) = '');

CREATE INDEX IF NOT EXISTS idx_profiles_email_lower
  ON public.profiles (lower(email))
  WHERE email IS NOT NULL;
