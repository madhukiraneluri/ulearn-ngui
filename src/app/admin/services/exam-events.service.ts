import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export type ExamEventKind = 'college' | 'batch' | 'other';
export type ExamEventStatus = 'draft' | 'active' | 'completed';

export interface ExamEvent {
  id: string;
  kind: ExamEventKind;
  title: string;
  collegeName: string | null;
  batchId: string | null;
  startsAt: string;
  endsAt: string;
  status: ExamEventStatus;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ExamEventsService {
  async listEvents(): Promise<ExamEvent[]> {
    const { data, error } = await supabase
      .from('exam_events')
      .select('id, kind, title, college_name, batch_id, starts_at, ends_at, status, created_at')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapEvent);
  }

  async getEvent(id: string): Promise<ExamEvent | null> {
    const { data, error } = await supabase
      .from('exam_events')
      .select('id, kind, title, college_name, batch_id, starts_at, ends_at, status, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapEvent(data) : null;
  }

  async createCollegeExam(collegeName: string, startsAt: string, endsAt: string): Promise<string> {
    return this.create('college', collegeName.trim(), collegeName.trim(), null, startsAt, endsAt);
  }

  async createBatchExam(batchId: string, title: string, startsAt: string, endsAt: string): Promise<string> {
    return this.create('batch', title.trim(), null, batchId, startsAt, endsAt);
  }

  async setStatus(eventId: string, status: ExamEventStatus): Promise<void> {
    const { error } = await supabase.rpc('set_exam_event_status', {
      p_event_id: eventId,
      p_status: status
    });
    if (error) throw new Error(error.message);
  }

  async addRole(eventId: string, name: string, hasCoding: boolean, durationMinutes: number): Promise<void> {
    const { error } = await supabase.rpc('add_exam_event_role', {
      p_event_id: eventId,
      p_name: name.trim(),
      p_has_coding: hasCoding,
      p_duration: durationMinutes
    });
    if (error) throw new Error(error.message);
  }

  private async create(
    kind: 'college' | 'batch',
    title: string,
    collegeName: string | null,
    batchId: string | null,
    startsAt: string,
    endsAt: string
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_exam_event', {
      p_kind: kind,
      p_title: title,
      p_college_name: collegeName,
      p_batch_id: batchId,
      p_starts_at: startsAt,
      p_ends_at: endsAt
    });
    if (error) throw new Error(error.message);
    return String(data);
  }
}

function mapEvent(row: {
  id: string;
  kind: ExamEventKind;
  title: string;
  college_name: string | null;
  batch_id: string | null;
  starts_at: string;
  ends_at: string;
  status: ExamEventStatus;
  created_at: string;
}): ExamEvent {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    collegeName: row.college_name,
    batchId: row.batch_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at
  };
}

export function examEventLabel(event: Pick<ExamEvent, 'kind' | 'title' | 'collegeName'>): string {
  if (event.kind === 'college') return event.collegeName || event.title;
  return event.title;
}
