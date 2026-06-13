import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';
import { DashboardStats } from '../../models';

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  async getStats(): Promise<DashboardStats> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalStudents },
      { count: totalCourses },
      { data: enrollments },
      { count: newStudentsWeek }
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('courses').select('*', { count: 'exact', head: true }),
      supabase.from('enrollments').select('course_id, enrolled_at, courses(price)'),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekStart)
    ]);

    const enrollmentRows = enrollments ?? [];
    const thisMonth = enrollmentRows.filter(
      (e) => e.enrolled_at && e.enrolled_at >= monthStart
    ).length;

    let totalRevenue = 0;
    for (const row of enrollmentRows) {
      const courseRaw = row.courses;
      const course = Array.isArray(courseRaw) ? courseRaw[0] : courseRaw;
      if (course && typeof course === 'object' && 'price' in course) {
        totalRevenue += Number((course as { price: number }).price) || 0;
      }
    }

    return {
      totalStudents: totalStudents ?? 0,
      totalCourses: totalCourses ?? 0,
      totalRevenue,
      totalEnrollmentsThisMonth: thisMonth,
      totalPapersPublished: 0,
      activeInternships: 0,
      pendingReferrals: 0,
      newStudentsThisWeek: newStudentsWeek ?? 0
    };
  }
}
