-- Backfill profiles for auth users missing a row (e.g. admin accounts)
-- and auto-create profiles for new sign-ups.

INSERT INTO public.profiles (
  id,
  full_name,
  email,
  role,
  profile_completed,
  must_reset_password,
  created_by_admin
)
SELECT
  u.id,
  COALESCE(
    NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    split_part(u.email, '@', 1)
  ),
  u.email,
  CASE
    WHEN COALESCE(u.raw_user_meta_data ->> 'role', '') = 'ADMIN' THEN 'ADMIN'
    ELSE 'USER'
  END,
  false,
  COALESCE((u.raw_user_meta_data ->> 'must_reset_password')::boolean, false),
  COALESCE((u.raw_user_meta_data ->> 'created_by_admin')::boolean, false)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    role,
    profile_completed,
    must_reset_password,
    created_by_admin
  )
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data ->> 'role', '') = 'ADMIN' THEN 'ADMIN'
      ELSE 'USER'
    END,
    false,
    COALESCE((NEW.raw_user_meta_data ->> 'must_reset_password')::boolean, false),
    COALESCE((NEW.raw_user_meta_data ->> 'created_by_admin')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
