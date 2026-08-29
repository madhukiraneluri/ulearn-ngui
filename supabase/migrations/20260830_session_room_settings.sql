-- Live session room control settings (instructor-managed)

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS allow_student_mic boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_student_camera boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_student_unmute boolean NOT NULL DEFAULT true;
