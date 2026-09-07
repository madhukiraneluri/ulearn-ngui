-- Extended scheduling options for live sessions

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'one_time'
    CHECK (session_type IN ('one_time', 'permanent')),
  ADD COLUMN IF NOT EXISTS session_place text NOT NULL DEFAULT 'virtual'
    CHECK (session_place IN ('virtual', 'external', 'in_person')),
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata';
