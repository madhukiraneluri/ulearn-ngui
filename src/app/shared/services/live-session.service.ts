import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';
import type { LiveSessionStatus, StudentLiveSession } from '../../models';

const JOIN_WINDOW_MS = 10 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class LiveSessionService {
  async listForCourse(courseId: string, userId: string): Promise<StudentLiveSession[]> {
    const { data: memberships, error: memberErr } = await supabase
      .from('batch_members')
      .select('batch_id')
      .eq('user_id', userId);

    if (memberErr) {
      console.error('LiveSessionService.listForCourse memberships:', memberErr);
      return [];
    }

    const batchIds = (memberships ?? []).map((m) => String(m.batch_id));
    if (batchIds.length === 0) return [];

    const { data, error } = await supabase
      .from('live_sessions')
      .select('*, batches(id, name), session_invites(role, token)')
      .eq('course_id', courseId)
      .in('batch_id', batchIds)
      .neq('status', 'cancelled')
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('LiveSessionService.listForCourse:', error);
      return [];
    }

    const now = Date.now();
    return (data ?? []).map((row) => {
      const batchRaw = row.batches;
      const batch = (Array.isArray(batchRaw) ? batchRaw[0] : batchRaw) as { name?: string } | null;
      const invites = (row.session_invites ?? []) as Array<{ role: string; token: string }>;
      const studentInvite = invites.find((i) => i.role === 'student');
      const scheduledAt = String(row.scheduled_at);
      const status = row.status as LiveSessionStatus;
      const scheduledMs = new Date(scheduledAt).getTime();
      const endMs = scheduledMs + Number(row.duration_minutes ?? 90) * 60 * 1000;

      const canJoin =
        status === 'live' ||
        (status === 'scheduled' && now >= scheduledMs - JOIN_WINDOW_MS && now <= endMs);

      return {
        id: String(row.id),
        batchId: String(row.batch_id),
        batchName: String(batch?.name ?? 'Batch'),
        courseId: String(row.course_id),
        title: String(row.title),
        description: (row.description as string | null) ?? null,
        scheduledAt,
        durationMinutes: Number(row.duration_minutes ?? 90),
        status,
        studentJoinToken: studentInvite?.token ?? null,
        canJoin
      };
    });
  }

  async getNextForCourses(
    courseIds: string[],
    userId: string
  ): Promise<Map<string, StudentLiveSession>> {
    const map = new Map<string, StudentLiveSession>();
    const now = Date.now();

    for (const courseId of courseIds) {
      const sessions = await this.listForCourse(courseId, userId);
      const upcoming = sessions
        .filter((s) => s.status === 'scheduled' || s.status === 'live')
        .filter((s) => {
          const end = new Date(s.scheduledAt).getTime() + s.durationMinutes * 60 * 1000;
          return end >= now;
        })
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

      if (upcoming) {
        map.set(courseId, upcoming);
      }
    }

    return map;
  }

  formatSessionDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return iso;
    }
  }

  joinPath(token: string): string {
    return `/s/join/${token}`;
  }
}
