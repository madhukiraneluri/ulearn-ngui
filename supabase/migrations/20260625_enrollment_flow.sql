-- Enrollment flow: discount coupons, extended enrollment fields, module unlocks

-- ─── Discount coupons ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.discount_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  discount_percentage numeric(5,2) NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discount_coupons_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_discount_coupons_code_upper ON public.discount_coupons (upper(code));

ALTER TABLE public.discount_coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage discount coupons" ON public.discount_coupons;
CREATE POLICY "Admin manage discount coupons" ON public.discount_coupons
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── Extended enrollment fields ───────────────────────────────────────────────

ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS college_name text,
  ADD COLUMN IF NOT EXISTS degree text,
  ADD COLUMN IF NOT EXISTS degree_year integer,
  ADD COLUMN IF NOT EXISTS specialization text,
  ADD COLUMN IF NOT EXISTS live_class_start_month text,
  ADD COLUMN IF NOT EXISTS coupon_code_used text,
  ADD COLUMN IF NOT EXISTS coupon_discount_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2);

-- ─── Module unlocks (admin grants content access per enrollment) ──────────────

CREATE TABLE IF NOT EXISTS public.module_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.course_curriculum(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  unlocked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT module_unlocks_enrollment_module_unique UNIQUE (enrollment_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_module_unlocks_enrollment ON public.module_unlocks (enrollment_id);

ALTER TABLE public.module_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own module unlocks" ON public.module_unlocks;
CREATE POLICY "Users read own module unlocks" ON public.module_unlocks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.id = module_unlocks.enrollment_id
        AND e.user_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admin manage module unlocks" ON public.module_unlocks;
CREATE POLICY "Admin manage module unlocks" ON public.module_unlocks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin delete module unlocks" ON public.module_unlocks;
CREATE POLICY "Admin delete module unlocks" ON public.module_unlocks
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ─── Validate coupon RPC (no list exposure) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_coupon(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.discount_coupons%ROWTYPE;
  v_normalized text;
BEGIN
  v_normalized := upper(trim(coalesce(p_code, '')));

  IF v_normalized = '' THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Coupon code is required');
  END IF;

  SELECT * INTO v_coupon
  FROM public.discount_coupons
  WHERE upper(code) = v_normalized
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Invalid coupon code');
  END IF;

  IF NOT v_coupon.active THEN
    RETURN jsonb_build_object('valid', false, 'message', 'This coupon is no longer active');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'This coupon has expired');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.usage_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'message', 'This coupon has reached its usage limit');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'discount_percentage', v_coupon.discount_percentage,
    'message', 'Coupon applied'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_coupon(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text) TO anon;

-- Increment coupon usage (called from edge function on successful payment)
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN;
  END IF;

  UPDATE public.discount_coupons
  SET usage_count = usage_count + 1,
      updated_at = now()
  WHERE upper(code) = upper(trim(p_code));
END;
$$;

REVOKE ALL ON FUNCTION public.increment_coupon_usage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(text) TO service_role;
