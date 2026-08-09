-- Live sessions (LiveKit) tied to batches

CREATE TABLE IF NOT EXISTS public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 90 CHECK (duration_minutes > 0),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  livekit_room_name text NOT NULL,
  host_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_batch ON public.live_sessions (batch_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_course ON public.live_sessions (course_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_scheduled ON public.live_sessions (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON public.live_sessions (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_sessions_room ON public.live_sessions (livekit_room_name);

CREATE TABLE IF NOT EXISTS public.session_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('instructor', 'moderator', 'student')),
  token text NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_invites_session_role_unique UNIQUE (session_id, role),
  CONSTRAINT session_invites_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_session_invites_session ON public.session_invites (session_id);
CREATE INDEX IF NOT EXISTS idx_session_invites_token ON public.session_invites (token);

CREATE TABLE IF NOT EXISTS public.session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('instructor', 'moderator', 'student')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  CONSTRAINT session_attendance_session_user_unique UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_attendance_session ON public.session_attendance (session_id);

-- ─── RLS: live_sessions ─────────────────────────────────────────────────────

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage live sessions" ON public.live_sessions;
CREATE POLICY "Admin manage live sessions" ON public.live_sessions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Batch members read live sessions" ON public.live_sessions;
CREATE POLICY "Batch members read live sessions" ON public.live_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.batch_members bm
      WHERE bm.batch_id = live_sessions.batch_id AND bm.user_id = auth.uid()
    )
  );

-- ─── RLS: session_invites ───────────────────────────────────────────────────

ALTER TABLE public.session_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage session invites" ON public.session_invites;
CREATE POLICY "Admin manage session invites" ON public.session_invites
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users read invites for their batch sessions" ON public.session_invites;
CREATE POLICY "Users read invites for their batch sessions" ON public.session_invites
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.live_sessions ls
      JOIN public.batch_members bm ON bm.batch_id = ls.batch_id
      WHERE ls.id = session_invites.session_id AND bm.user_id = auth.uid()
    )
  );

-- ─── RLS: session_attendance ────────────────────────────────────────────────

ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage session attendance" ON public.session_attendance;
CREATE POLICY "Admin manage session attendance" ON public.session_attendance
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users read own session attendance" ON public.session_attendance;
CREATE POLICY "Users read own session attendance" ON public.session_attendance
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users insert own session attendance" ON public.session_attendance;
CREATE POLICY "Users insert own session attendance" ON public.session_attendance
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own session attendance" ON public.session_attendance;
CREATE POLICY "Users update own session attendance" ON public.session_attendance
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
