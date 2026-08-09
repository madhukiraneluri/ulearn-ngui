import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';
import type { LiveSession, LiveSessionStatus, SessionInvite, SessionRole } from '../../models';

export interface AdminSessionRow extends LiveSession {
  batchName: string;
  courseTitle: string;
}

export interface SessionInviteLink {
  role: SessionRole;
  token: string;
  url: string;
}

export interface SessionUpsertInput {
  batchId: string;
  title: string;
  description?: string | null;
  scheduledAt: string;
  durationMinutes?: number;
  hostUserId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminSessionsService {
  buildJoinUrl(token: string): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/s/join/${token}`;
    }
    return `/s/join/${token}`;
  }

  async listAll(): Promise<AdminSessionRow[]> {
    const { data, error } = await supabase
      .from('live_sessions')
      .select('*, batches(id, name), courses(id, title)')
      .order('scheduled_at', { ascending: false });

    if (error) {
      console.error('AdminSessionsService.listAll:', error);
      return [];
    }

    return (data ?? []).map((row) => this.mapRow(row));
  }

  async listForBatch(batchId: string): Promise<AdminSessionRow[]> {
    const { data, error } = await supabase
      .from('live_sessions')
      .select('*, batches(id, name), courses(id, title)')
      .eq('batch_id', batchId)
      .order('scheduled_at', { ascending: false });

    if (error) {
      console.error('AdminSessionsService.listForBatch:', error);
      return [];
    }

    return (data ?? []).map((row) => this.mapRow(row));
  }

  async getById(id: string): Promise<AdminSessionRow | null> {
    const { data, error } = await supabase
      .from('live_sessions')
      .select('*, batches(id, name), courses(id, title)')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      console.error('AdminSessionsService.getById:', error);
      return null;
    }

    return this.mapRow(data);
  }

  async getInvites(sessionId: string): Promise<SessionInvite[]> {
    const { data, error } = await supabase
      .from('session_invites')
      .select('*')
      .eq('session_id', sessionId)
      .order('role');

    if (error) {
      console.error('AdminSessionsService.getInvites:', error);
      return [];
    }

    return (data ?? []).map((row) => this.mapInvite(row));
  }

  async getInviteLinks(sessionId: string): Promise<SessionInviteLink[]> {
    const invites = await this.getInvites(sessionId);
    return invites.map((invite) => ({
      role: invite.role,
      token: invite.token,
      url: this.buildJoinUrl(invite.token)
    }));
  }

  async create(input: SessionUpsertInput): Promise<AdminSessionRow | null> {
    const batch = await this.getBatchCourse(input.batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    const sessionId = crypto.randomUUID();
    const roomName = `ulearn-${sessionId.replace(/-/g, '')}`;
    const createdBy = await this.resolveCreatedBy();

    const { data, error } = await supabase
      .from('live_sessions')
      .insert({
        id: sessionId,
        batch_id: input.batchId,
        course_id: batch.courseId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        scheduled_at: input.scheduledAt,
        duration_minutes: input.durationMinutes ?? 90,
        status: 'scheduled',
        livekit_room_name: roomName,
        host_user_id: input.hostUserId ?? null,
        created_by: createdBy
      })
      .select('*, batches(id, name), courses(id, title)')
      .single();

    if (error) {
      console.error('AdminSessionsService.create:', error);
      throw new Error(error.message);
    }

    await this.createDefaultInvites(sessionId);
    return this.mapRow(data);
  }

  async update(
    id: string,
    input: Partial<SessionUpsertInput> & { status?: LiveSessionStatus }
  ): Promise<boolean> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (input.title != null) payload['title'] = input.title.trim();
    if (input.description !== undefined) payload['description'] = input.description?.trim() || null;
    if (input.scheduledAt != null) payload['scheduled_at'] = input.scheduledAt;
    if (input.durationMinutes != null) payload['duration_minutes'] = input.durationMinutes;
    if (input.hostUserId !== undefined) payload['host_user_id'] = input.hostUserId;
    if (input.status != null) {
      payload['status'] = input.status;
      if (input.status === 'ended') payload['ended_at'] = new Date().toISOString();
      if (input.status === 'live') payload['started_at'] = new Date().toISOString();
    }

    const { error } = await supabase.from('live_sessions').update(payload).eq('id', id);
    if (error) {
      console.error('AdminSessionsService.update:', error);
      return false;
    }
    return true;
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase.from('live_sessions').delete().eq('id', id);
    if (error) {
      console.error('AdminSessionsService.delete:', error);
      return false;
    }
    return true;
  }

  async regenerateInvites(sessionId: string): Promise<SessionInviteLink[]> {
    const roles: SessionRole[] = ['instructor', 'moderator', 'student'];
    for (const role of roles) {
      const token = this.generateToken();
      const { error } = await supabase
        .from('session_invites')
        .update({ token, revoked: false })
        .eq('session_id', sessionId)
        .eq('role', role);

      if (error) {
        console.error('AdminSessionsService.regenerateInvites:', error);
        throw new Error(error.message);
      }
    }

    return this.getInviteLinks(sessionId);
  }

  private async createDefaultInvites(sessionId: string): Promise<void> {
    const roles: SessionRole[] = ['instructor', 'moderator', 'student'];
    const rows = roles.map((role) => ({
      session_id: sessionId,
      role,
      token: this.generateToken()
    }));

    const { error } = await supabase.from('session_invites').insert(rows);
    if (error) {
      console.error('AdminSessionsService.createDefaultInvites:', error);
      throw new Error(error.message);
    }
  }

  private async getBatchCourse(batchId: string): Promise<{ courseId: string } | null> {
    const { data, error } = await supabase
      .from('batches')
      .select('course_id')
      .eq('id', batchId)
      .maybeSingle();

    if (error || !data) return null;
    return { courseId: String(data.course_id) };
  }

  private async resolveCreatedBy(): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    return profile?.id ?? null;
  }

  private generateToken(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private mapRow(row: Record<string, unknown>): AdminSessionRow {
    const batchRaw = row['batches'];
    const courseRaw = row['courses'];
    const batch = (Array.isArray(batchRaw) ? batchRaw[0] : batchRaw) as { name?: string } | null;
    const course = (Array.isArray(courseRaw) ? courseRaw[0] : courseRaw) as { title?: string } | null;

    return {
      id: String(row['id']),
      batchId: String(row['batch_id']),
      courseId: String(row['course_id']),
      batchName: String(batch?.name ?? 'Unknown batch'),
      courseTitle: String(course?.title ?? 'Unknown course'),
      title: String(row['title']),
      description: (row['description'] as string | null) ?? null,
      scheduledAt: String(row['scheduled_at']),
      durationMinutes: Number(row['duration_minutes'] ?? 90),
      status: row['status'] as LiveSessionStatus,
      livekitRoomName: String(row['livekit_room_name']),
      hostUserId: (row['host_user_id'] as string | null) ?? null,
      createdBy: (row['created_by'] as string | null) ?? null,
      startedAt: (row['started_at'] as string | null) ?? null,
      endedAt: (row['ended_at'] as string | null) ?? null,
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at'])
    };
  }

  private mapInvite(row: Record<string, unknown>): SessionInvite {
    return {
      id: String(row['id']),
      sessionId: String(row['session_id']),
      role: row['role'] as SessionRole,
      token: String(row['token']),
      revoked: Boolean(row['revoked']),
      createdAt: String(row['created_at'])
    };
  }
}
