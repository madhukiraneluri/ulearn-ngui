import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';
import type { SessionRole } from '../../models';

export interface SessionJoinAccessResult {
  allowed: boolean;
  role: SessionRole | null;
  sessionTitle: string | null;
  batchId: string | null;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class LiveSessionJoinService {
  async validateAccess(inviteToken: string, userId: string): Promise<SessionJoinAccessResult> {
    if (!inviteToken.trim()) {
      return {
        allowed: false,
        role: null,
        sessionTitle: null,
        batchId: null,
        message: 'Invalid join link'
      };
    }

    const { data: invite, error: inviteErr } = await supabase
      .from('session_invites')
      .select('role, revoked, live_sessions(id, batch_id, title, status)')
      .eq('token', inviteToken.trim())
      .maybeSingle();

    if (inviteErr || !invite) {
      return {
        allowed: false,
        role: null,
        sessionTitle: null,
        batchId: null,
        message: 'This join link is invalid or you do not have access'
      };
    }

    if (invite.revoked) {
      return {
        allowed: false,
        role: null,
        sessionTitle: null,
        batchId: null,
        message: 'This join link has been revoked'
      };
    }

    const sessionRaw = invite.live_sessions;
    const session = (Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw) as
      | { id: string; batch_id: string; title: string; status: string }
      | null;

    if (!session) {
      return {
        allowed: false,
        role: null,
        sessionTitle: null,
        batchId: null,
        message: 'Session not found'
      };
    }

    const role = invite.role as SessionRole;
    const sessionTitle = session.title;
    const batchId = String(session.batch_id);

    if (session.status === 'cancelled') {
      return {
        allowed: false,
        role,
        sessionTitle,
        batchId,
        message: 'This session was cancelled'
      };
    }

    if (session.status === 'ended') {
      return {
        allowed: false,
        role,
        sessionTitle,
        batchId,
        message: 'This session has ended'
      };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    const isAdmin = profile?.role === 'ADMIN';

    if (role === 'student') {
      const { data: membership } = await supabase
        .from('batch_members')
        .select('id')
        .eq('batch_id', batchId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!membership) {
        return {
          allowed: false,
          role,
          sessionTitle,
          batchId,
          message:
            'Only students assigned to this batch can join with the student link. Sign in with your student account or ask your admin to add you to the batch.'
        };
      }

      if (isAdmin) {
        return {
          allowed: false,
          role,
          sessionTitle,
          batchId,
          message: 'Admins cannot join using the student link. Use the instructor or moderator link instead.'
        };
      }

      return {
        allowed: true,
        role,
        sessionTitle,
        batchId,
        message: 'Access granted'
      };
    }

    if (role === 'instructor') {
      const { data: sessionRow } = await supabase
        .from('live_sessions')
        .select('host_user_id')
        .eq('id', session.id)
        .maybeSingle();

      const isHost = sessionRow?.host_user_id === userId;
      if (!isAdmin && !isHost) {
        return {
          allowed: false,
          role,
          sessionTitle,
          batchId,
          message: 'Only the assigned instructor or an admin can use this link'
        };
      }

      return {
        allowed: true,
        role,
        sessionTitle,
        batchId,
        message: 'Access granted'
      };
    }

    if (role === 'moderator') {
      if (!isAdmin) {
        return {
          allowed: false,
          role,
          sessionTitle,
          batchId,
          message: 'Only admins can use the moderator link'
        };
      }

      return {
        allowed: true,
        role,
        sessionTitle,
        batchId,
        message: 'Access granted'
      };
    }

    return {
      allowed: false,
      role,
      sessionTitle,
      batchId,
      message: 'Unknown join link type'
    };
  }
}
