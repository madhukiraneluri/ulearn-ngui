-- Batch branches: named groups combining two or more batches

CREATE TABLE IF NOT EXISTS public.batch_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT batch_branches_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.batch_branch_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.batch_branches(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT batch_branch_batches_unique UNIQUE (branch_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_branch_batches_branch ON public.batch_branch_batches (branch_id);
CREATE INDEX IF NOT EXISTS idx_batch_branch_batches_batch ON public.batch_branch_batches (batch_id);

ALTER TABLE public.batch_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_branch_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage batch branches" ON public.batch_branches;
CREATE POLICY "Admin manage batch branches" ON public.batch_branches
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin manage batch branch batches" ON public.batch_branch_batches;
CREATE POLICY "Admin manage batch branch batches" ON public.batch_branch_batches
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
