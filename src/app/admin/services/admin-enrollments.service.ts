import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';
import { AdminCourseService } from './admin-course.service';
import { BulkEnrollRowResult } from './enrollment-bulk-import.util';

export interface CourseEnrollmentRow {
  enrollmentId: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  collegeName: string | null;
  specialization: string | null;
  degree: string | null;
  degreeYear: number | null;
  liveClassStartMonth: string | null;
  couponCodeUsed: string | null;
  amountPaid: number | null;
  enrolledAt: string;
  progressPercent: number;
}

export interface CourseEnrollmentSummary {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  totalEnrolled: number;
  enrollments: CourseEnrollmentRow[];
}

interface ProfileLookup {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminEnrollmentsService {
  constructor(private readonly courseService: AdminCourseService) {}

  async getEnrollmentsForCourse(courseId: string): Promise<CourseEnrollmentSummary | null> {
    const course = await this.courseService.getById(courseId);
    if (!course) return null;

    const { data, error } = await supabase
      .from('enrollments')
      .select(
        'id, user_id, enrolled_at, full_name, phone, email, college_name, degree, degree_year, specialization, live_class_start_month, coupon_code_used, amount_paid'
      )
      .eq('course_id', courseId)
      .order('enrolled_at', { ascending: false });

    if (error) {
      console.error('AdminEnrollmentsService.getEnrollmentsForCourse:', error);
      return {
        courseId,
        courseTitle: course.title,
        courseSlug: course.slug,
        totalEnrolled: 0,
        enrollments: []
      };
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return {
        courseId,
        courseTitle: course.title,
        courseSlug: course.slug,
        totalEnrolled: 0,
        enrollments: []
      };
    }

    const userIds = rows.map((r) => String(r.user_id));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .in('id', userIds);

    const profileMap = new Map<string, ProfileLookup>();
    for (const p of profiles ?? []) {
      profileMap.set(String(p.id), {
        id: String(p.id),
        full_name: p.full_name as string | null,
        email: p.email as string | null,
        phone: p.phone as string | null
      });
    }

    const progressMap = await this.progressForCourse(courseId, userIds);

    const enrollments: CourseEnrollmentRow[] = rows.map((row) => {
      const userId = String(row.user_id);
      const profile = profileMap.get(userId);
      const enrollmentName = (row.full_name as string | null)?.trim();
      const enrollmentEmail = (row.email as string | null)?.trim();
      const enrollmentPhone = (row.phone as string | null)?.trim();
      return {
        enrollmentId: String(row.id),
        userId,
        name: enrollmentName || String(profile?.full_name ?? 'Unnamed user'),
        email: enrollmentEmail || (profile?.email ?? null),
        phone: enrollmentPhone || (profile?.phone ?? null),
        collegeName: (row.college_name as string | null) ?? null,
        specialization: (row.specialization as string | null) ?? null,
        degree: (row.degree as string | null) ?? null,
        degreeYear: row.degree_year != null ? Number(row.degree_year) : null,
        liveClassStartMonth: (row.live_class_start_month as string | null) ?? null,
        couponCodeUsed: (row.coupon_code_used as string | null) ?? null,
        amountPaid: row.amount_paid != null ? Number(row.amount_paid) : null,
        enrolledAt: String(row.enrolled_at),
        progressPercent: progressMap.get(userId) ?? 0
      };
    });

    return {
      courseId,
      courseTitle: course.title,
      courseSlug: course.slug,
      totalEnrolled: enrollments.length,
      enrollments
    };
  }

  async bulkEnrollByEmail(
    courseId: string,
    rows: Array<{ rowNumber: number; email: string }>
  ): Promise<BulkEnrollRowResult[]> {
    const emailMap = await this.buildEmailLookupMap();
    const alreadyEnrolled = await this.getEnrolledUserIdsForCourse(courseId);
    const results: BulkEnrollRowResult[] = [];

    for (const row of rows) {
      const profile = emailMap.get(row.email);

      if (!profile) {
        results.push({
          rowNumber: row.rowNumber,
          email: row.email,
          success: false,
          message: 'No account found for this email'
        });
        continue;
      }

      if (alreadyEnrolled.has(profile.id)) {
        results.push({
          rowNumber: row.rowNumber,
          email: row.email,
          success: true,
          message: `Already enrolled (${profile.full_name ?? 'user'})`
        });
        continue;
      }

      const { error } = await supabase.from('enrollments').insert({
        user_id: profile.id,
        course_id: courseId
      });

      if (error) {
        results.push({
          rowNumber: row.rowNumber,
          email: row.email,
          success: false,
          message: error.message
        });
      } else {
        alreadyEnrolled.add(profile.id);
        results.push({
          rowNumber: row.rowNumber,
          email: row.email,
          success: true,
          message: `Enrolled ${profile.full_name ?? profile.email ?? 'user'}`
        });
      }
    }

    return results;
  }

  async removeEnrollment(enrollmentId: string): Promise<boolean> {
    const { error } = await supabase.from('enrollments').delete().eq('id', enrollmentId);
    if (error) {
      console.error('AdminEnrollmentsService.removeEnrollment:', error);
      return false;
    }
    return true;
  }

  private async buildEmailLookupMap(): Promise<
    Map<string, { id: string; full_name: string | null; email: string | null }>
  > {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .not('email', 'is', null);

    const map = new Map<string, { id: string; full_name: string | null; email: string | null }>();

    if (error) {
      console.error('AdminEnrollmentsService.buildEmailLookupMap:', error);
      return map;
    }

    for (const p of data ?? []) {
      const email = String(p.email ?? '').trim().toLowerCase();
      if (email) {
        map.set(email, {
          id: String(p.id),
          full_name: p.full_name as string | null,
          email: p.email as string | null
        });
      }
    }

    return map;
  }

  private async getEnrolledUserIdsForCourse(courseId: string): Promise<Set<string>> {
    const { data } = await supabase
      .from('enrollments')
      .select('user_id')
      .eq('course_id', courseId);

    return new Set((data ?? []).map((r) => String(r.user_id)));
  }

  private async progressForCourse(
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
      for (const lesson of (mod.course_lessons as Array<{ id: string }>) ?? []) {
        lessonIds.push(String(lesson.id));
      }
    }

    const total = lessonIds.length;
    if (total === 0) {
      for (const uid of userIds) result.set(uid, 0);
      return result;
    }

    const { data: progress } = await supabase
      .from('lesson_progress')
      .select('user_id, lesson_id')
      .in('user_id', userIds)
      .eq('completed', true)
      .in('lesson_id', lessonIds);

    const completedByUser = new Map<string, number>();
    for (const p of progress ?? []) {
      const uid = String(p.user_id);
      completedByUser.set(uid, (completedByUser.get(uid) ?? 0) + 1);
    }

    for (const uid of userIds) {
      const done = completedByUser.get(uid) ?? 0;
      result.set(uid, Math.round((done / total) * 100));
    }

    return result;
  }
}
