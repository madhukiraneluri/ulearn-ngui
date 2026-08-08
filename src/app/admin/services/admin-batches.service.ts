import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';
import type { Batch, BatchMemberRow, BatchStatus } from '../../models';

export interface AdminBatchRow extends Batch {
  courseTitle: string;
  memberCount: number;
}

export interface BatchMemberDetailRow {
  memberId: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  phone: string | null;
  collegeName: string | null;
  degree: string | null;
  degreeYear: string | null;
  specialization: string | null;
  enrolledAt: string | null;
  liveClassStartMonth: string | null;
  progressPercent: number;
  amountPaid: number | null;
  couponCode: string | null;
  addedToBatchAt: string;
  enrollmentId: string | null;
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
  async getById(id: string): Promise<AdminBatchRow | null> {
    const all = await this.listAll();
    return all.find((b) => b.id === id) ?? null;
  }

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
    const createdBy = await this.resolveCreatedBy();
    const { data, error } = await supabase
      .from('batches')
      .insert({
        course_id: input.courseId,
        name: input.name.trim(),
        start_date: input.startDate || null,
        end_date: input.endDate || null,
        status: input.status ?? 'active',
        notes: input.notes?.trim() || null,
        created_by: createdBy
      })
      .select()
      .single();

    if (error) {
      console.error('AdminBatchesService.create:', error);
      throw new Error(this.formatBatchError(error));
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
      .select('id, batch_id, user_id, added_at')
      .eq('batch_id', batchId)
      .order('added_at', { ascending: false });

    if (error) {
      console.error('AdminBatchesService.listMembers:', error);
      return [];
    }

    const rows = data ?? [];
    if (rows.length === 0) return [];

    const userIds = rows.map((r) => String(r.user_id));
    const profileMap = await this.fetchProfileBasics(userIds);

    return rows.map((row) => {
      const userId = String(row.user_id);
      const profile = profileMap.get(userId);
      return {
        id: String(row.id),
        batchId: String(row.batch_id),
        userId,
        userName: profile?.name ?? 'Unnamed',
        userEmail: profile?.email ?? null,
        addedAt: String(row.added_at)
      };
    });
  }

  async listMemberDetails(batchId: string): Promise<BatchMemberDetailRow[]> {
    const batch = await this.getBatchCourse(batchId);
    if (!batch) return [];

    const { data: memberRows, error: memberErr } = await supabase
      .from('batch_members')
      .select('id, user_id, added_at')
      .eq('batch_id', batchId)
      .order('added_at', { ascending: false });

    if (memberErr) {
      console.error('AdminBatchesService.listMemberDetails members:', memberErr);
      return [];
    }

    const rows = memberRows ?? [];
    if (rows.length === 0) return [];

    const userIds = rows.map((r) => String(r.user_id));
    const [profiles, enrollments, progressMap] = await Promise.all([
      this.fetchProfileDetails(userIds),
      this.fetchEnrollmentsForCourse(batch.courseId, userIds),
      this.buildProgressForCourse(batch.courseId, userIds)
    ]);

    return rows.map((row) => {
      const userId = String(row.user_id);
      const profile = profiles.get(userId);
      const enrollment = enrollments.get(userId);

      return {
        memberId: String(row.id),
        userId,
        userName: profile?.fullName ?? enrollment?.fullName ?? 'Unnamed',
        userEmail: profile?.email ?? enrollment?.email ?? null,
        phone: profile?.phone ?? enrollment?.phone ?? null,
        collegeName: profile?.collegeName ?? enrollment?.collegeName ?? null,
        degree: enrollment?.degree ?? null,
        degreeYear: enrollment?.degreeYear ?? null,
        specialization: enrollment?.specialization ?? null,
        enrolledAt: enrollment?.enrolledAt ?? null,
        liveClassStartMonth: enrollment?.liveClassStartMonth ?? null,
        progressPercent: progressMap.get(userId) ?? 0,
        amountPaid: enrollment?.amountPaid ?? null,
        couponCode: enrollment?.couponCode ?? null,
        addedToBatchAt: String(row.added_at),
        enrollmentId: enrollment?.id ?? null
      };
    });
  }

  async collectMemberUserIds(batchIds: string[]): Promise<string[]> {
    const userIds = new Set<string>();
    for (const batchId of batchIds) {
      const members = await this.listMembers(batchId);
      for (const m of members) {
        userIds.add(m.userId);
      }
    }
    return [...userIds];
  }

  async addMember(batchId: string, userId: string): Promise<boolean> {
    const addedBy = await this.resolveCreatedBy();
    const { error } = await supabase.from('batch_members').upsert(
      {
        batch_id: batchId,
        user_id: userId,
        added_by: addedBy
      },
      { onConflict: 'batch_id,user_id', ignoreDuplicates: true }
    );

    if (error) {
      console.error('AdminBatchesService.addMember:', error);
      return false;
    }
    return true;
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

  private async fetchProfileBasics(
    userIds: string[]
  ): Promise<Map<string, { name: string; email: string | null }>> {
    const map = new Map<string, { name: string; email: string | null }>();
    if (userIds.length === 0) return map;

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    for (const row of data ?? []) {
      map.set(String(row.id), {
        name: String(row.full_name ?? 'Unnamed'),
        email: (row.email as string | null) ?? null
      });
    }
    return map;
  }

  private async fetchProfileDetails(userIds: string[]): Promise<
    Map<
      string,
      {
        fullName: string;
        email: string | null;
        phone: string | null;
        collegeName: string | null;
      }
    >
  > {
    const map = new Map<
      string,
      { fullName: string; email: string | null; phone: string | null; collegeName: string | null }
    >();
    if (userIds.length === 0) return map;

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, college_name')
      .in('id', userIds);

    for (const row of data ?? []) {
      map.set(String(row.id), {
        fullName: String(row.full_name ?? 'Unnamed'),
        email: (row.email as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        collegeName: (row.college_name as string | null) ?? null
      });
    }
    return map;
  }

  private async fetchEnrollmentsForCourse(
    courseId: string,
    userIds: string[]
  ): Promise<
    Map<
      string,
      {
        id: string;
        fullName: string | null;
        email: string | null;
        phone: string | null;
        collegeName: string | null;
        degree: string | null;
        degreeYear: string | null;
        specialization: string | null;
        enrolledAt: string;
        liveClassStartMonth: string | null;
        amountPaid: number | null;
        couponCode: string | null;
      }
    >
  > {
    const map = new Map<
      string,
      {
        id: string;
        fullName: string | null;
        email: string | null;
        phone: string | null;
        collegeName: string | null;
        degree: string | null;
        degreeYear: string | null;
        specialization: string | null;
        enrolledAt: string;
        liveClassStartMonth: string | null;
        amountPaid: number | null;
        couponCode: string | null;
      }
    >();

    if (userIds.length === 0) return map;

    const { data } = await supabase
      .from('enrollments')
      .select(
        'id, user_id, enrolled_at, full_name, email, phone, college_name, degree, degree_year, specialization, live_class_start_month, amount_paid, coupon_code_used'
      )
      .eq('course_id', courseId)
      .in('user_id', userIds);

    for (const row of data ?? []) {
      map.set(String(row.user_id), {
        id: String(row.id),
        fullName: (row.full_name as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        collegeName: (row.college_name as string | null) ?? null,
        degree: (row.degree as string | null) ?? null,
        degreeYear: row.degree_year != null ? String(row.degree_year) : null,
        specialization: (row.specialization as string | null) ?? null,
        enrolledAt: String(row.enrolled_at),
        liveClassStartMonth: (row.live_class_start_month as string | null) ?? null,
        amountPaid: row.amount_paid != null ? Number(row.amount_paid) : null,
        couponCode: (row.coupon_code_used as string | null) ?? null
      });
    }
    return map;
  }

  private async buildProgressForCourse(
    courseId: string,
    userIds: string[]
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (userIds.length === 0) return result;

    const { data: modules } = await supabase
      .from('course_curriculum')
      .select('course_lessons(id)')
      .eq('course_id', courseId);

    const lessonIds: string[] = [];
    for (const mod of modules ?? []) {
      const lessons = (mod.course_lessons as Array<{ id: string }>) ?? [];
      for (const lesson of lessons) {
        lessonIds.push(String(lesson.id));
      }
    }

    if (lessonIds.length === 0) {
      for (const uid of userIds) result.set(uid, 0);
      return result;
    }

    const { data: progress } = await supabase
      .from('lesson_progress')
      .select('user_id, lesson_id')
      .in('user_id', userIds)
      .eq('completed', true)
      .in('lesson_id', lessonIds);

    const completedByUser = new Map<string, Set<string>>();
    for (const p of progress ?? []) {
      const uid = String(p.user_id);
      const set = completedByUser.get(uid) ?? new Set<string>();
      set.add(String(p.lesson_id));
      completedByUser.set(uid, set);
    }

    for (const uid of userIds) {
      const done = [...(completedByUser.get(uid) ?? [])].filter((id) =>
        lessonIds.includes(id)
      ).length;
      const pct = Math.round((done / lessonIds.length) * 100);
      result.set(uid, pct);
    }

    return result;
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

  private async resolveCreatedBy(): Promise<string | null> {
    const { data: user } = await supabase.auth.getUser();
    const userId = user.user?.id;
    if (!userId) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    return profile?.id ?? null;
  }

  private formatBatchError(error: { code?: string; message?: string }): string {
    if (error.code === '23503') {
      return 'Invalid course or user reference. Try signing out and back in, then retry.';
    }
    if (error.code === '23505') {
      return 'A batch with this name already exists for this course.';
    }
    return error.message ?? 'Could not save batch';
  }
}
