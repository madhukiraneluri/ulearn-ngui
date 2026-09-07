-- Persisted whiteboard scenes per live session board tab

CREATE TABLE IF NOT EXISTS public.session_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  board_key text NOT NULL DEFAULT 'board-1',
  scene jsonb NOT NULL DEFAULT '{"elements":[],"appState":{}}'::jsonb,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_boards_session_board_key_unique UNIQUE (session_id, board_key)
);

CREATE INDEX IF NOT EXISTS idx_session_boards_session ON public.session_boards (session_id);

ALTER TABLE public.session_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage session boards" ON public.session_boards;
CREATE POLICY "Admin manage session boards" ON public.session_boards
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Batch members read session boards" ON public.session_boards;
CREATE POLICY "Batch members read session boards" ON public.session_boards
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.live_sessions ls
      JOIN public.batch_members bm ON bm.batch_id = ls.batch_id
      WHERE ls.id = session_boards.session_id
        AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Batch members write session boards" ON public.session_boards;
CREATE POLICY "Batch members write session boards" ON public.session_boards
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.live_sessions ls
      JOIN public.batch_members bm ON bm.batch_id = ls.batch_id
      WHERE ls.id = session_boards.session_id
        AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Batch members update session boards" ON public.session_boards;
CREATE POLICY "Batch members update session boards" ON public.session_boards
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.live_sessions ls
      JOIN public.batch_members bm ON bm.batch_id = ls.batch_id
      WHERE ls.id = session_boards.session_id
        AND bm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.live_sessions ls
      JOIN public.batch_members bm ON bm.batch_id = ls.batch_id
      WHERE ls.id = session_boards.session_id
        AND bm.user_id = auth.uid()
    )
  );
