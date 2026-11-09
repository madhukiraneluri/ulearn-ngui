-- CRT-014: CRT-only announcements (placement notices / drive dates).
-- Students with crt.access may read published rows only. Admins manage via is_admin().
-- Does not modify CRT-008 or CRT-012 objects.

BEGIN;

CREATE TABLE public.crt_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  drive_date date,
  published_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crt_announcements_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT crt_announcements_body_not_blank CHECK (length(trim(body)) > 0),
  CONSTRAINT crt_announcements_status_published_at_check CHECK (
    (status = 'draft' AND published_at IS NULL)
    OR (status = 'published' AND published_at IS NOT NULL)
  )
);

CREATE INDEX crt_announcements_published_latest_idx
  ON public.crt_announcements (published_at DESC)
  WHERE status = 'published';

DROP TRIGGER IF EXISTS crt_announcements_updated_at ON public.crt_announcements;
CREATE TRIGGER crt_announcements_updated_at
  BEFORE UPDATE ON public.crt_announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_content_updated_at();

REVOKE ALL ON TABLE public.crt_announcements FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crt_announcements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crt_announcements TO service_role;

ALTER TABLE public.crt_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crt_announcements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage crt announcements" ON public.crt_announcements;
CREATE POLICY "Admin manage crt announcements" ON public.crt_announcements
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Students read published crt announcements" ON public.crt_announcements;
CREATE POLICY "Students read published crt announcements" ON public.crt_announcements
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND (SELECT public.has_permission('crt.access'))
  );

COMMIT;
