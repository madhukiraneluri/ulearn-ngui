-- Session creation options (MeritHub-style defaults)

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS max_participants integer,
  ADD COLUMN IF NOT EXISTS default_student_permission text NOT NULL DEFAULT 'audio_video'
    CHECK (default_student_permission IN ('audio', 'audio_video', 'writing')),
  ADD COLUMN IF NOT EXISTS allow_guest_join boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS isolate_students boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.live_sessions.max_participants IS 'NULL or 0 = unlimited participants';
COMMENT ON COLUMN public.live_sessions.default_student_permission IS 'Default AV permissions for students when session goes live';
COMMENT ON COLUMN public.live_sessions.allow_guest_join IS 'Reserved: allow join without ULearn account';
COMMENT ON COLUMN public.live_sessions.isolate_students IS 'Students cannot see or hear each other';
