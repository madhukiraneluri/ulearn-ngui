import { Injectable } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../core/supabase.client';
import { AdminCourseService, AdminCourseRow } from './admin-course.service';
import type { StudentBatchSummary } from '../../models';
import type {
  CreateStudentsPayload,
  CreateStudentsResponse
} from './student-provision.util';

export interface AdminEnrollmentRow {
  id: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  enrolledAt: string;
  progressPercent: number;
}

export interface AdminStudentRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  joinedAt: string;
  enrollmentCount: number;
  enrollments: AdminEnrollmentRow[];
  batches: StudentBatchSummary[];
  mustResetPassword: boolean;
  createdByAdmin: boolean;
}

export interface RecentEnrollmentRow {
  id: string;
  studentName: string;
  studentId: string;
  courseTitle: string;
  enrolledAt: string;
  progressPercent: number;
}

export interface StudentPickerOption {
  id: string;
  name: string;
  email: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminStudentsService {
  constructor(private readonly courseService: AdminCourseService) {}

  async listStudentPickerOptions(): Promise<StudentPickerOption[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('AdminStudentsService.listStudentPickerOptions:', error);
      return [];
    }

    return (data ?? [])
      .filter((p) => p.role !== 'ADMIN')
      .map((p) => ({
        id: String(p.id),
        name: String(p.full_name ?? 'Unnamed user'),
        email: (p.email as string | null) ?? null
      }));
  }

  async listStudents(): Promise<AdminStudentRow[]> {
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, created_at, must_reset_password, created_by_admin')
      .order('created_at', { ascending: false });

    if (profErr) {
      console.error('AdminStudentsService.listStudents profiles:', profErr);
      return [];
    }

    const users = (profiles ?? []).filter((p) => p.role !== 'ADMIN');
    if (users.length === 0) return [];

    const userIds = users.map((p) => p.id as string);

    const { data: enrollments, error: enrErr } = await supabase
      .from('enrollments')
      .select('id, user_id, course_id, enrolled_at, courses(id, title, slug)')
      .in('user_id', userIds)
      .order('enrolled_at', { ascending: false });

    if (enrErr) {
      console.error('AdminStudentsService.listStudents enrollments:', enrErr);
    }

    const progressMap = await this.buildProgressMap(userIds);
    const batchesByUser = await this.buildBatchesMap(userIds);

    const enrollmentsByUser: Record<string, AdminEnrollmentRow[]> = {};

    for (const row of enrollments ?? []) {
      const userId = String(row.user_id);
      const courseRaw = row.courses;
      const course = (Array.isArray(courseRaw) ? courseRaw[0] : courseRaw) as
        | { id: string; title: string; slug: string }
        | null;
      if (!course) continue;

      const courseId = String(row.course_id);
      const key = `${userId}:${courseId}`;
      const progress = progressMap.get(key) ?? 0;

      enrollmentsByUser[userId] = enrollmentsByUser[userId] ?? [];
      enrollmentsByUser[userId].push({
        id: String(row.id),
        courseId,
        courseTitle: String(course.title),
        courseSlug: String(course.slug),
        enrolledAt: String(row.enrolled_at),
        progressPercent: progress
      });
    }

    return users.map((p) => {
      const id = String(p.id);
      const enrs = enrollmentsByUser[id] ?? [];
      return {
        id,
        name: String(p.full_name ?? 'Unnamed user'),
        email: (p.email as string) || null,
        phone: (p.phone as string) || null,
        role: String(p.role ?? 'USER'),
        joinedAt: String(p.created_at),
        enrollmentCount: enrs.length,
        enrollments: enrs,
        batches: batchesByUser[id] ?? [],
        mustResetPassword: Boolean(p.must_reset_password),
        createdByAdmin: Boolean(p.created_by_admin)
      };
    });
  }

  async createStudents(payload: CreateStudentsPayload): Promise<CreateStudentsResponse> {
    const { data, error } = await supabase.functions.invoke('create-student', {
      body: payload
    });

    if (error) {
      console.error('AdminStudentsService.createStudents:', error);
      throw new Error(await this.formatFunctionError(error));
    }

    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw new Error(String(data.error));
    }

    return data as CreateStudentsResponse;
  }

  private async formatFunctionError(error: unknown): Promise<string> {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { error?: string; message?: string };
        if (body?.error) return String(body.error);
        if (body?.message) return String(body.message);
      } catch {
        /* use default message */
      }
    }
    return error instanceof Error ? error.message : 'Request failed';
  }

  async resendCredentials(userId: string): Promise<{
    emailSent: boolean;
    tempPassword?: string;
    emailError?: string;
  }> {
    const { data, error } = await supabase.functions.invoke('resend-credentials', {
      body: { userId }
    });

    if (error) {
      console.error('AdminStudentsService.resendCredentials:', error);
      throw new Error(error.message);
    }

    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw new Error(String(data.error));
    }

    const result = data as {
      emailSent?: boolean;
      tempPassword?: string;
      emailError?: string | null;
    };

    return {
      emailSent: Boolean(result.emailSent),
      tempPassword: result.tempPassword,
      emailError: result.emailError ?? undefined
    };
  }

  async addStudentToBatch(userId: string, batchId: string): Promise<void> {
    const { data: batch, error: batchErr } = await supabase
      .from('batches')
      .select('course_id, start_date')
      .eq('id', batchId)
      .maybeSingle();

    if (batchErr || !batch) throw new Error('Batch not found');

    await this.manualEnroll(userId, String(batch.course_id));

    if (batch.start_date) {
      await supabase
        .from('enrollments')
        .update({ live_class_start_month: String(batch.start_date).slice(0, 7) })
        .eq('user_id', userId)
        .eq('course_id', String(batch.course_id));
    }

    const { data: user } = await supabase.auth.getUser();
    const { error: memberErr } = await supabase.from('batch_members').upsert(
      {
        batch_id: batchId,
        user_id: userId,
        added_by: user.user?.id ?? null
      },
      { onConflict: 'batch_id,user_id', ignoreDuplicates: true }
    );

    if (memberErr) throw new Error(memberErr.message);
  }

  async removeStudentFromBatch(memberId: string): Promise<boolean> {
    const { error } = await supabase.from('batch_members').delete().eq('id', memberId);
    if (error) {
      console.error('AdminStudentsService.removeStudentFromBatch:', error);
      return false;
    }
    return true;
  }

  private async buildBatchesMap(userIds: string[]): Promise<Record<string, StudentBatchSummary[]>> {
    const result: Record<string, StudentBatchSummary[]> = {};
    if (userIds.length === 0) return result;

    const { data, error } = await supabase
      .from('batch_members')
      .select('user_id, batch_id, batches(id, name, courses(title))')
      .in('user_id', userIds);

    if (error) {
      console.error('AdminStudentsService.buildBatchesMap:', error);
      return result;
    }

    for (const row of data ?? []) {
      const userId = String(row.user_id);
      const batchRaw = row.batches;
      const batch = (Array.isArray(batchRaw) ? batchRaw[0] : batchRaw) as
        | { id: string; name: string; courses: { title: string } | { title: string }[] | null }
        | null;
      if (!batch) continue;

      const courseRaw = batch.courses;
      const course = (Array.isArray(courseRaw) ? courseRaw[0] : courseRaw) as { title: string } | null;

      result[userId] = result[userId] ?? [];
      result[userId].push({
        batchId: String(batch.id),
        batchName: String(batch.name),
        courseTitle: String(course?.title ?? 'Course')
      });
    }

    return result;
  }

  async listRecentEnrollments(limit = 10): Promise<RecentEnrollmentRow[]> {
    const { data, error } = await supabase
      .from('enrollments')
      .select('id, user_id, course_id, enrolled_at, profiles(full_name), courses(title)')
      .order('enrolled_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('AdminStudentsService.listRecentEnrollments:', error);
      return [];
    }

    const userIds = [...new Set((data ?? []).map((r) => String(r.user_id)))];
    const progressMap = await this.buildProgressMap(userIds);

    return (data ?? []).map((row) => {
      const profileRaw = row.profiles;
      const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as
        | { full_name: string | null }
        | null;
      const courseRaw = row.courses;
      const course = (Array.isArray(courseRaw) ? courseRaw[0] : courseRaw) as
        | { title: string }
        | null;
      const userId = String(row.user_id);
      const courseId = String(row.course_id);

      return {
        id: String(row.id),
        studentName: String(profile?.full_name ?? 'Unnamed user'),
        studentId: userId,
        courseTitle: String(course?.title ?? 'Unknown course'),
        enrolledAt: String(row.enrolled_at),
        progressPercent: progressMap.get(`${userId}:${courseId}`) ?? 0
      };
    });
  }

  async listCoursesForEnroll(): Promise<AdminCourseRow[]> {
    return this.courseService.listAll();
  }

  async manualEnroll(userId: string, courseId: string): Promise<boolean> {
    const { data: existing } = await supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .maybeSingle();

    if (existing) return true;

    const { error } = await supabase.from('enrollments').insert({
      user_id: userId,
      course_id: courseId
    });

    if (error) {
      console.error('AdminStudentsService.manualEnroll:', error);
      throw new Error(error.message);
    }
    return true;
  }

  async removeEnrollment(enrollmentId: string): Promise<boolean> {
    const { error } = await supabase.from('enrollments').delete().eq('id', enrollmentId);
    if (error) {
      console.error('AdminStudentsService.removeEnrollment:', error);
      return false;
    }
    return true;
  }

  async deleteUser(userId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: { userId }
    });

    if (error) {
      console.error('AdminStudentsService.deleteUser:', error);
      throw new Error(error.message);
    }

    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw new Error(String(data.error));
    }
  }

  private async buildProgressMap(userIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (userIds.length === 0) return result;

    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('user_id, course_id')
      .in('user_id', userIds);

    const courseIds = [...new Set((enrollments ?? []).map((e) => String(e.course_id)))];
    if (courseIds.length === 0) return result;

    const { data: modules } = await supabase
      .from('course_curriculum')
      .select('course_id, course_lessons(id)')
      .in('course_id', courseIds);

    const lessonsByCourse: Record<string, string[]> = {};
    const allLessonIds: string[] = [];

    for (const mod of modules ?? []) {
      const courseId = String(mod.course_id);
      const lessons = (mod.course_lessons as Array<{ id: string }>) ?? [];
      for (const lesson of lessons) {
        lessonsByCourse[courseId] = lessonsByCourse[courseId] ?? [];
        lessonsByCourse[courseId].push(String(lesson.id));
        allLessonIds.push(String(lesson.id));
      }
    }

    let progressRows: Array<{ user_id: string; lesson_id: string }> = [];
    if (allLessonIds.length > 0) {
      const { data: progress } = await supabase
        .from('lesson_progress')
        .select('user_id, lesson_id')
        .in('user_id', userIds)
        .eq('completed', true)
        .in('lesson_id', allLessonIds);

      progressRows = (progress ?? []) as Array<{ user_id: string; lesson_id: string }>;
    }

    const completedByUser = new Map<string, Set<string>>();
    for (const p of progressRows) {
      const uid = String(p.user_id);
      const set = completedByUser.get(uid) ?? new Set<string>();
      set.add(String(p.lesson_id));
      completedByUser.set(uid, set);
    }

    for (const enr of enrollments ?? []) {
      const userId = String(enr.user_id);
      const courseId = String(enr.course_id);
      const lessonIds = lessonsByCourse[courseId] ?? [];
      const completed = completedByUser.get(userId);
      const done = lessonIds.filter((id) => completed?.has(id)).length;
      const pct = lessonIds.length > 0 ? Math.round((done / lessonIds.length) * 100) : 0;
      result.set(`${userId}:${courseId}`, pct);
    }

    return result;
  }
}
