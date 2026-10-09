-- GoTrue writes custom app_metadata after insert, so a BEFORE INSERT check on
-- app_metadata.provisioned always rejected new accounts. Allow a verified signup
-- token or a one-time server nonce instead. Both are present on the insert row.

CREATE TABLE IF NOT EXISTS public.auth_provision_nonces (
  email text PRIMARY KEY,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

ALTER TABLE public.auth_provision_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_provision_nonces FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_provision_nonces FROM PUBLIC, anon, authenticated;

DROP TABLE IF EXISTS public.signup_create_debug;

CREATE OR REPLACE FUNCTION public.enforce_provisioned_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_email text;
  v_token text;
  v_nonce text;
BEGIN
  v_email := lower(trim(NEW.email));
  v_token := NULLIF(trim(NEW.raw_user_meta_data ->> 'signup_token'), '');
  v_nonce := NULLIF(trim(NEW.raw_user_meta_data ->> 'provision_nonce'), '');

  IF v_token IS NOT NULL THEN
    UPDATE public.signup_email_otps
    SET consumed_at = now()
    WHERE email = v_email
      AND verified_at IS NOT NULL
      AND consumed_at IS NULL
      AND verified_at > now() - interval '20 minutes'
      AND token_hash = encode(
        extensions.digest(convert_to(token_salt || ':' || v_token, 'UTF8'), 'sha256'),
        'hex'
      )
    RETURNING email INTO v_email;

    IF v_email IS NOT NULL THEN
      RETURN NEW;
    END IF;

    v_email := lower(trim(NEW.email));
  END IF;

  IF v_nonce IS NOT NULL THEN
    UPDATE public.auth_provision_nonces
    SET used_at = now()
    WHERE email = v_email
      AND nonce = v_nonce
      AND used_at IS NULL
      AND expires_at > now()
    RETURNING email INTO v_email;

    IF v_email IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Verify your email before creating an account';
END;
$$;

UPDATE public.profiles
SET full_name = 'Rams',
    email = 'rams2898@gmail.com'
WHERE id = 'f59bd55f-6af8-4b85-ab92-d980c5f327cd'
  AND full_name = 'Test5';

UPDATE auth.users
SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', 'Rams')
WHERE id = 'f59bd55f-6af8-4b85-ab92-d980c5f327cd'
  AND coalesce(raw_user_meta_data ->> 'full_name', '') = 'Test5';
