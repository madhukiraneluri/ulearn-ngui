import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';
import type { ExcalidrawPersistedScene } from '../../models';

@Injectable({ providedIn: 'root' })
export class SessionBoardService {
  async loadBoard(sessionId: string, boardKey: string): Promise<ExcalidrawPersistedScene | null> {
    const { data, error } = await supabase
      .from('session_boards')
      .select('scene')
      .eq('session_id', sessionId)
      .eq('board_key', boardKey)
      .maybeSingle();

    if (error) {
      console.error('Failed to load session board', error);
      return null;
    }

    if (!data?.scene) return null;
    return data.scene as ExcalidrawPersistedScene;
  }

  async saveBoard(sessionId: string, boardKey: string, scene: ExcalidrawPersistedScene): Promise<void> {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('session_boards').upsert(
      {
        session_id: sessionId,
        board_key: boardKey,
        scene,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'session_id,board_key' }
    );

    if (error) {
      console.error('Failed to save session board', error);
    }
  }
}
