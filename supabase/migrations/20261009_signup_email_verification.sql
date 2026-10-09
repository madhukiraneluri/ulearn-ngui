-- Signup email OTP challenges, plus a gate so public sign-up cannot create
-- auth users unless the server marked the account as provisioned.

CREATE TABLE IF NOT EXISTS public.signup_email_otps (
  email text PRIMARY KEY,
  code_hash text NOT NULL,
  code_salt text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  token_hash text,
  token_salt text,
  verified_at timestamptz,
  consumed_at timestamptz
);

ALTER TABLE public.signup_email_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_email_otps FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.signup_email_otps FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auth_email_exists(target_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(email) = lower(trim(target_email))
  );
$$;

REVOKE ALL ON FUNCTION public.auth_email_exists(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_exists(text) TO service_role;

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
      WHEN COALESCE(NEW.raw_app_meta_data ->> 'role', '') = 'ADMIN' THEN 'ADMIN'
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

CREATE OR REPLACE FUNCTION public.enforce_provisioned_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.raw_app_meta_data ->> 'provisioned', '') = 'true' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Verify your email before creating an account';
END;
$$;

DROP TRIGGER IF EXISTS enforce_provisioned_signup ON auth.users;
CREATE TRIGGER enforce_provisioned_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_provisioned_signup();
