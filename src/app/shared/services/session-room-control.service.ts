import { Injectable } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../core/supabase.client';
import type { SessionRoomSettings } from '../../models';

export type SessionRoomControlAction =
  | 'mute_all'
  | 'allow_unmute'
  | 'disallow_unmute'
  | 'update_settings'
  | 'mute_participant';

export interface SessionRoomControlResult {
  ok: boolean;
  settings?: SessionRoomSettings;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class SessionRoomControlService {
  async startSession(sessionId: string): Promise<SessionRoomControlResult> {
    return this.invoke({ sessionId, action: 'start_session' });
  }

  async muteAll(sessionId: string): Promise<SessionRoomControlResult> {
    return this.invoke({ sessionId, action: 'mute_all' });
  }

  async allowUnmute(sessionId: string): Promise<SessionRoomControlResult> {
    return this.invoke({ sessionId, action: 'allow_unmute' });
  }

  async disallowUnmute(sessionId: string): Promise<SessionRoomControlResult> {
    return this.invoke({ sessionId, action: 'disallow_unmute' });
  }

  async updateSettings(
    sessionId: string,
    settings: Partial<SessionRoomSettings>
  ): Promise<SessionRoomControlResult> {
    return this.invoke({ sessionId, action: 'update_settings', settings });
  }

  async muteParticipant(sessionId: string, identity: string): Promise<SessionRoomControlResult> {
    return this.invoke({ sessionId, action: 'mute_participant', participantIdentity: identity });
  }

  private async invoke(body: Record<string, unknown>): Promise<SessionRoomControlResult> {
    const { data, error } = await supabase.functions.invoke<SessionRoomControlResult>(
      'session-room-control',
      { body }
    );

    if (error) {
      return { ok: false, error: await this.formatInvokeError(error) };
    }

    if (!data?.ok) {
      return { ok: false, error: data?.error ?? 'Room control failed' };
    }

    return data;
  }

  private async formatInvokeError(error: unknown): Promise<string> {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (body && typeof body === 'object' && 'error' in body) {
          return String((body as { error: string }).error);
        }
      } catch {
        /* use fallback */
      }
    }
    return error instanceof Error ? error.message : 'Room control failed';
  }
}
