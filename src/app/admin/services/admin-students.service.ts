import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';
import { AdminCourseService, AdminCourseRow } from './admin-course.service';

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
}

export interface RecentEnrollmentRow {
  id: string;
  studentName: string;
  studentId: string;
  courseTitle: string;
  enrolledAt: string;
  progressPercent: number;
}

@Injectable({ providedIn: 'root' })
export class AdminStudentsService {
  constructor(private readonly courseService: AdminCourseService) {}

  async listStudents(): Promise<AdminStudentRow[]> {
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, created_at')
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
        enrollments: enrs
      };
    });
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
