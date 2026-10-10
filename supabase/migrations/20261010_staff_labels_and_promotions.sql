-- Staff labels, the permissions on each label, and who belongs to them.
-- Main Admin keeps label management. Other labels only open the screens they are given.

CREATE TABLE IF NOT EXISTS public.staff_permissions (
  key text PRIMARY KEY,
  group_name text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.staff_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  portal_access boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_label_permissions (
  label_id uuid NOT NULL REFERENCES public.staff_labels(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.staff_permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (label_id, permission_key)
);

CREATE TABLE IF NOT EXISTS public.staff_label_members (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.staff_labels(id) ON DELETE CASCADE,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, label_id)
);

CREATE INDEX IF NOT EXISTS staff_label_members_label_id_idx
  ON public.staff_label_members (label_id);

ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_label_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_label_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_labels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_label_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_label_members FORCE ROW LEVEL SECURITY;

INSERT INTO public.staff_permissions (key, group_name, label, sort_order) VALUES
  ('dashboard.view', 'Overview', 'Dashboard', 10),
  ('courses.manage', 'Learning', 'Courses', 20),
  ('curriculum.manage', 'Learning', 'Curriculum', 30),
  ('batches.manage', 'Learning', 'Batches', 40),
  ('sessions.manage', 'Learning', 'Sessions', 50),
  ('students.manage', 'People', 'Students', 60),
  ('enrollments.manage', 'People', 'Enrollments', 70),
  ('mentors.manage', 'People', 'Mentor profiles', 80),
  ('exams.manage', 'Exams', 'Exams', 90),
  ('exam_registrations.manage', 'Exams', 'Exam registrations', 100),
  ('coupons.manage', 'Site', 'Coupons', 110),
  ('blogs.manage', 'Site', 'Blogs', 120),
  ('internships.manage', 'Site', 'Internships', 130),
  ('applications.manage', 'Site', 'Applications', 140),
  ('papers.manage', 'Site', 'Papers', 150),
  ('stories.manage', 'Site', 'Student stories', 160),
  ('settings.manage', 'Control', 'Site settings', 170),
  ('labels.manage', 'Control', 'Labels and members', 180),
  ('promotions.send', 'Control', 'Promotion emails', 190)
ON CONFLICT (key) DO UPDATE
SET group_name = EXCLUDED.group_name,
    label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order;

INSERT INTO public.staff_labels (slug, name, description, is_system, portal_access) VALUES
  ('main_admin', 'Main Admin', 'Company owner. Can manage labels and every admin screen.', true, true),
  ('admin', 'Admin', 'Company staff. Sees the screens enabled on this label.', true, true),
  ('mentor', 'Mentor', 'Tutors. Teaching screens only.', true, true),
  ('campus_admin', 'Campus Admin', 'College principals and campus administrators.', true, true),
  ('student', 'Student', 'Learners. No admin panel.', true, false)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_system = true,
    portal_access = EXCLUDED.portal_access;

INSERT INTO public.staff_label_permissions (label_id, permission_key)
SELECT l.id, p.key
FROM public.staff_labels l
CROSS JOIN public.staff_permissions p
WHERE l.slug IN ('main_admin', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff_label_permissions (label_id, permission_key)
SELECT l.id, p.key
FROM public.staff_labels l
JOIN public.staff_permissions p ON p.key IN (
  'dashboard.view', 'curriculum.manage', 'batches.manage', 'sessions.manage', 'students.manage'
)
WHERE l.slug = 'mentor'
ON CONFLICT DO NOTHING;

INSERT INTO public.staff_label_permissions (label_id, permission_key)
SELECT l.id, p.key
FROM public.staff_labels l
JOIN public.staff_permissions p ON p.key IN (
  'dashboard.view', 'students.manage', 'enrollments.manage', 'batches.manage',
  'exams.manage', 'exam_registrations.manage'
)
WHERE l.slug = 'campus_admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.staff_label_members (user_id, label_id)
SELECT p.id, l.id
FROM public.profiles p
JOIN public.staff_labels l ON l.slug = 'main_admin'
WHERE lower(p.email) = 'rams2898@gmail.com'
ON CONFLICT DO NOTHING;

INSERT INTO public.staff_label_members (user_id, label_id)
SELECT p.id, l.id
FROM public.profiles p
JOIN public.staff_labels l ON l.slug = 'admin'
WHERE p.role = 'ADMIN'
  AND lower(coalesce(p.email, '')) <> 'rams2898@gmail.com'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
  OR EXISTS (
    SELECT 1
    FROM public.staff_label_members m
    JOIN public.staff_labels l ON l.id = m.label_id
    WHERE m.user_id = auth.uid()
      AND l.portal_access = true
  )
  OR COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'ADMIN';
$$;

CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.is_admin()
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_label_members WHERE user_id = auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1
    FROM public.staff_label_members m
    JOIN public.staff_label_permissions lp ON lp.label_id = m.label_id
    WHERE m.user_id = auth.uid()
      AND lp.permission_key = perm
  );
$$;

CREATE OR REPLACE FUNCTION public.my_staff_access()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'portal', public.is_admin(),
    'labeled', EXISTS (
      SELECT 1 FROM public.staff_label_members WHERE user_id = auth.uid()
    ),
    'permissions', COALESCE((
      SELECT jsonb_agg(DISTINCT lp.permission_key)
      FROM public.staff_label_members m
      JOIN public.staff_label_permissions lp ON lp.label_id = m.label_id
      WHERE m.user_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_staff_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_staff_access() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_can_send_promotions(target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = target_user AND role = 'ADMIN'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_label_members
      WHERE user_id = target_user
    )
  )
  OR EXISTS (
    SELECT 1
    FROM public.staff_label_members m
    JOIN public.staff_label_permissions lp ON lp.label_id = m.label_id
    WHERE m.user_id = target_user
      AND lp.permission_key = 'promotions.send'
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_send_promotions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_send_promotions(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.protect_staff_label()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system THEN
    RAISE EXCEPTION 'System labels cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_system AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'System label keys cannot be changed';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS protect_staff_label ON public.staff_labels;
CREATE TRIGGER protect_staff_label
  BEFORE UPDATE OR DELETE ON public.staff_labels
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_staff_label();

CREATE OR REPLACE FUNCTION public.keep_main_admin_label_right()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  SELECT slug INTO v_slug FROM public.staff_labels WHERE id = OLD.label_id;
  IF v_slug = 'main_admin' AND OLD.permission_key = 'labels.manage' THEN
    RAISE EXCEPTION 'Main Admin must keep label management';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS keep_main_admin_label_right ON public.staff_label_permissions;
CREATE TRIGGER keep_main_admin_label_right
  BEFORE DELETE ON public.staff_label_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_main_admin_label_right();

DROP POLICY IF EXISTS "Managers read permission catalog" ON public.staff_permissions;
CREATE POLICY "Managers read permission catalog" ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (public.has_permission('labels.manage'));

DROP POLICY IF EXISTS "Managers read labels" ON public.staff_labels;
CREATE POLICY "Managers read labels" ON public.staff_labels
  FOR SELECT TO authenticated
  USING (public.has_permission('labels.manage'));

DROP POLICY IF EXISTS "Managers insert labels" ON public.staff_labels;
CREATE POLICY "Managers insert labels" ON public.staff_labels
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('labels.manage') AND is_system = false);

DROP POLICY IF EXISTS "Managers update labels" ON public.staff_labels;
CREATE POLICY "Managers update labels" ON public.staff_labels
  FOR UPDATE TO authenticated
  USING (public.has_permission('labels.manage'))
  WITH CHECK (public.has_permission('labels.manage'));

DROP POLICY IF EXISTS "Managers delete custom labels" ON public.staff_labels;
CREATE POLICY "Managers delete custom labels" ON public.staff_labels
  FOR DELETE TO authenticated
  USING (public.has_permission('labels.manage') AND is_system = false);

DROP POLICY IF EXISTS "Managers read label permissions" ON public.staff_label_permissions;
CREATE POLICY "Managers read label permissions" ON public.staff_label_permissions
  FOR SELECT TO authenticated
  USING (public.has_permission('labels.manage'));

DROP POLICY IF EXISTS "Managers insert label permissions" ON public.staff_label_permissions;
CREATE POLICY "Managers insert label permissions" ON public.staff_label_permissions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('labels.manage'));

DROP POLICY IF EXISTS "Managers delete label permissions" ON public.staff_label_permissions;
CREATE POLICY "Managers delete label permissions" ON public.staff_label_permissions
  FOR DELETE TO authenticated
  USING (public.has_permission('labels.manage'));

DROP POLICY IF EXISTS "Managers read label members" ON public.staff_label_members;
CREATE POLICY "Managers read label members" ON public.staff_label_members
  FOR SELECT TO authenticated
  USING (public.has_permission('labels.manage'));

DROP POLICY IF EXISTS "Managers insert label members" ON public.staff_label_members;
CREATE POLICY "Managers insert label members" ON public.staff_label_members
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('labels.manage'));

DROP POLICY IF EXISTS "Managers delete label members" ON public.staff_label_members;
CREATE POLICY "Managers delete label members" ON public.staff_label_members
  FOR DELETE TO authenticated
  USING (public.has_permission('labels.manage'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'promotion-assets',
  'promotion-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read promotion images" ON storage.objects;
CREATE POLICY "Public read promotion images" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'promotion-assets');

DROP POLICY IF EXISTS "Staff upload promotion images" ON storage.objects;
CREATE POLICY "Staff upload promotion images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'promotion-assets' AND public.has_permission('promotions.send'));

DROP POLICY IF EXISTS "Staff update promotion images" ON storage.objects;
CREATE POLICY "Staff update promotion images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'promotion-assets' AND public.has_permission('promotions.send'))
  WITH CHECK (bucket_id = 'promotion-assets' AND public.has_permission('promotions.send'));
