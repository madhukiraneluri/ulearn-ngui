-- Internship applications: users apply; admins review and update status

CREATE TABLE public.internship_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internship_id uuid NOT NULL REFERENCES public.internships(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied', 'reviewing', 'accepted', 'rejected')),
  applied_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (internship_id, user_id)
);

CREATE INDEX internship_applications_internship_idx
  ON public.internship_applications(internship_id);
CREATE INDEX internship_applications_user_idx
  ON public.internship_applications(user_id);
CREATE INDEX internship_applications_status_idx
  ON public.internship_applications(status);

CREATE TRIGGER internship_applications_updated_at
  BEFORE UPDATE ON public.internship_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_content_updated_at();

ALTER TABLE public.internship_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own internship applications" ON public.internship_applications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own internship applications" ON public.internship_applications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'applied');

CREATE POLICY "Admin read all internship applications" ON public.internship_applications
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin update internship applications" ON public.internship_applications
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
