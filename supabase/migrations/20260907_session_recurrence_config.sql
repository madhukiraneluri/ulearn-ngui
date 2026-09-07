-- Store weekly recurrence for permanent session series (one row per batch, shared room link)

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS recurrence_config jsonb;
