-- Batches (course cohorts) and admin-provisioned student flags

-- ─── Admin provision flags on profiles ────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_reset_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_admin boolean NOT NULL DEFAULT false;

-- ─── Batches ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'archived')),
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT batches_course_name_unique UNIQUE (course_id, name)
);

CREATE INDEX IF NOT EXISTS idx_batches_course ON public.batches (course_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON public.batches (status);

-- ─── Batch members (student ↔ batch, many-to-many) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.batch_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT batch_members_batch_user_unique UNIQUE (batch_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_members_batch ON public.batch_members (batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_members_user ON public.batch_members (user_id);

-- ─── RLS: batches ───────────────────────────────────────────────────────────

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage batches" ON public.batches;
CREATE POLICY "Admin manage batches" ON public.batches
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users read batches they belong to" ON public.batches;
CREATE POLICY "Users read batches they belong to" ON public.batches
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.batch_members bm
      WHERE bm.batch_id = batches.id AND bm.user_id = auth.uid()
    )
  );

-- ─── RLS: batch_members ─────────────────────────────────────────────────────

ALTER TABLE public.batch_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage batch members" ON public.batch_members;
CREATE POLICY "Admin manage batch members" ON public.batch_members
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users read own batch memberships" ON public.batch_members;
CREATE POLICY "Users read own batch memberships" ON public.batch_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
