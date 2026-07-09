import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';
import type { Batch, BatchMemberRow, BatchStatus } from '../../models';

export interface AdminBatchRow extends Batch {
  courseTitle: string;
  memberCount: number;
}

export interface BatchUpsertInput {
  courseId: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  status?: BatchStatus;
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminBatchesService {
  async listAll(): Promise<AdminBatchRow[]> {
    const { data, error } = await supabase
      .from('batches')
      .select('*, courses(id, title)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('AdminBatchesService.listAll:', error);
      return [];
    }

    const rows = data ?? [];
    if (rows.length === 0) return [];

    const batchIds = rows.map((r) => String(r.id));
    const { data: counts } = await supabase
      .from('batch_members')
      .select('batch_id')
      .in('batch_id', batchIds);

    const countMap = new Map<string, number>();
    for (const c of counts ?? []) {
      const id = String(c.batch_id);
      countMap.set(id, (countMap.get(id) ?? 0) + 1);
    }

    return rows.map((row) => {
      const courseRaw = row.courses;
      const course = (Array.isArray(courseRaw) ? courseRaw[0] : courseRaw) as
        | { id: string; title: string }
        | null;
      const id = String(row.id);
      return {
        id,
        courseId: String(row.course_id),
        courseTitle: String(course?.title ?? 'Unknown course'),
        name: String(row.name),
        startDate: (row.start_date as string | null) ?? null,
        endDate: (row.end_date as string | null) ?? null,
        status: row.status as BatchStatus,
        notes: (row.notes as string | null) ?? null,
        createdBy: (row.created_by as string | null) ?? null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        memberCount: countMap.get(id) ?? 0
      };
    });
  }

  async listForCourse(courseId: string): Promise<AdminBatchRow[]> {
    const all = await this.listAll();
    return all.filter((b) => b.courseId === courseId);
  }

  async create(input: BatchUpsertInput): Promise<Batch | null> {
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('batches')
      .insert({
        course_id: input.courseId,
        name: input.name.trim(),
        start_date: input.startDate || null,
        end_date: input.endDate || null,
        status: input.status ?? 'active',
        notes: input.notes?.trim() || null,
        created_by: user.user?.id ?? null
      })
      .select()
      .single();

    if (error) {
      console.error('AdminBatchesService.create:', error);
      throw new Error(error.message);
    }

    return this.mapBatch(data);
  }

  async update(id: string, input: Partial<BatchUpsertInput>): Promise<boolean> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.courseId !== undefined) payload['course_id'] = input.courseId;
    if (input.name !== undefined) payload['name'] = input.name.trim();
    if (input.startDate !== undefined) payload['start_date'] = input.startDate || null;
    if (input.endDate !== undefined) payload['end_date'] = input.endDate || null;
    if (input.status !== undefined) payload['status'] = input.status;
    if (input.notes !== undefined) payload['notes'] = input.notes?.trim() || null;

    const { error } = await supabase.from('batches').update(payload).eq('id', id);
    if (error) {
      console.error('AdminBatchesService.update:', error);
      return false;
    }
    return true;
  }

  async delete(id: string): Promise<{ ok: boolean; message?: string }> {
    const { count } = await supabase
      .from('batch_members')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', id);

    if ((count ?? 0) > 0) {
      return { ok: false, message: 'Remove all students from this batch before deleting.' };
    }

    const { error } = await supabase.from('batches').delete().eq('id', id);
    if (error) {
      console.error('AdminBatchesService.delete:', error);
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  async listMembers(batchId: string): Promise<BatchMemberRow[]> {
    const { data, error } = await supabase
      .from('batch_members')
      .select('id, batch_id, user_id, added_at, profiles(full_name, email)')
      .eq('batch_id', batchId)
      .order('added_at', { ascending: false });

    if (error) {
      console.error('AdminBatchesService.listMembers:', error);
      return [];
    }

    return (data ?? []).map((row) => {
      const profileRaw = row.profiles;
      const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as
        | { full_name: string | null; email: string | null }
        | null;
      return {
        id: String(row.id),
        batchId: String(row.batch_id),
        userId: String(row.user_id),
        userName: String(profile?.full_name ?? 'Unnamed'),
        userEmail: (profile?.email as string | null) ?? null,
        addedAt: String(row.added_at)
      };
    });
  }

  async addMember(batchId: string, userId: string): Promise<boolean> {
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from('batch_members').upsert(
      {
        batch_id: batchId,
        user_id: userId,
        added_by: user.user?.id ?? null
      },
      { onConflict: 'batch_id,user_id', ignoreDuplicates: true }
    );

    if (error) {
      console.error('AdminBatchesService.addMember:', error);
      return false;
    }
    return true;
  }

  async removeMember(memberId: string): Promise<boolean> {
    const { error } = await supabase.from('batch_members').delete().eq('id', memberId);
    if (error) {
      console.error('AdminBatchesService.removeMember:', error);
      return false;
    }
    return true;
  }

  private mapBatch(row: Record<string, unknown>): Batch {
    return {
      id: String(row['id']),
      courseId: String(row['course_id']),
      name: String(row['name']),
      startDate: (row['start_date'] as string | null) ?? null,
      endDate: (row['end_date'] as string | null) ?? null,
      status: row['status'] as BatchStatus,
      notes: (row['notes'] as string | null) ?? null,
      createdBy: (row['created_by'] as string | null) ?? null,
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at'])
    };
  }
}
