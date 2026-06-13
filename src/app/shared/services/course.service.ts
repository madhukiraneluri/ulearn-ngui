import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { CourseListItem, Course, Mentor, CourseFormat, UserEnrolledCourse } from '../../models';
import { supabase } from '../../core/supabase.client';

@Injectable({ providedIn: 'root' })
export class CourseService {
  private mapCategory(raw: string | null): CourseListItem['category'] {
    if (!raw) return 'technical';
    const s = String(raw).toLowerCase();
    if (s.includes('creative') || s.includes('design') || s.includes('art') || s.includes('ux')) {
      return 'creative';
    }
    if (s.includes('business') || s.includes('management') || s.includes('marketing')) {
      return 'business';
    }
    return 'technical';
  }

  private readonly courseListFields =
    'id, slug, title, category, status, price, original_price, duration_months, duration_days, weekly_hours, live_class_count, hours_per_class, course_format, total_lessons, rating, total_students, is_research_course, thumbnail_url';

  private readonly courseDetailFields =
    'id, slug, title, description, category, status, price, original_price, duration_months, duration_days, weekly_hours, live_class_count, hours_per_class, course_format, total_lessons, rating, total_students, is_research_course, thumbnail_url, created_at';

  private mapFormat(raw: string | null): CourseFormat | undefined {
    if (raw === '45-day' || raw === '3-month') return raw;
    return undefined;
  }

  private mapCourseMeta(r: Record<string, unknown>) {
    return {
      durationDays: r['duration_days'] != null ? Number(r['duration_days']) : undefined,
      weeklyHours: r['weekly_hours'] != null ? Number(r['weekly_hours']) : undefined,
      classCount: r['live_class_count'] != null ? Number(r['live_class_count']) : undefined,
      hoursPerClass: r['hours_per_class'] != null ? Number(r['hours_per_class']) : undefined,
      courseFormat: this.mapFormat(r['course_format'] as string | null)
    };
  }

  private mapMentor(raw: Record<string, unknown>): Mentor {
    return {
      id: String(raw['id']),
      name: String(raw['name'] ?? ''),
      role: String(raw['role'] ?? ''),
      company: String(raw['company'] ?? ''),
      bio: String(raw['bio'] ?? ''),
      avatarUrl: (raw['avatar_url'] as string) || undefined,
      linkedInUrl: (raw['linked_in_url'] as string) || undefined
    };
  }

  getCourses(): Observable<CourseListItem[]> {
    return from(
      supabase
        .from('courses')
        .select(this.courseListFields)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r) => this.mapListItem(r));
      }),
      catchError((err) => {
        console.error('getCourses error:', err);
        return of([]);
      })
    );
  }

  getCourseBySlug(slug: string): Observable<Course | null> {
    const promise = this.fetchCourseBySlug(slug);
    return from(promise).pipe(
      catchError((err) => {
        console.error('getCourseBySlug error:', err);
        return of(null);
      })
    );
  }

  private async fetchCourseBySlug(slug: string): Promise<Course | null> {
    const { data: courseRow, error: courseErr } = await supabase
      .from('courses')
      .select(this.courseDetailFields)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (courseErr) throw courseErr;
    if (!courseRow) return null;

    const courseId = courseRow.id;

    const { data: modules, error: modulesErr } = await supabase
      .from('course_curriculum')
      .select('id, title, description, order')
      .eq('course_id', courseId)
      .order('order', { ascending: true });

    if (modulesErr) throw modulesErr;

    const moduleIds = (modules ?? []).map((m) => m.id);
    const lessonsMap: Record<string, Array<Record<string, unknown>>> = {};

    if (moduleIds.length > 0) {
      const { data: lessons, error: lessonsErr } = await supabase
        .from('course_lessons')
        .select(
          'id, module_id, title, description, duration_minutes, is_free, order, resource_url, resource_type'
        )
        .in('module_id', moduleIds)
        .order('order', { ascending: true });

      if (lessonsErr) throw lessonsErr;

      for (const lesson of lessons ?? []) {
        const key = lesson.module_id as string;
        lessonsMap[key] = lessonsMap[key] ?? [];
        lessonsMap[key].push(lesson);
      }
    }

    const { data: mentors, error: mentorsErr } = await supabase
      .from('course_mentors')
      .select('id, name, role, company, bio, avatar_url, linked_in_url')
      .eq('course_id', courseId);

    if (mentorsErr) throw mentorsErr;

    const curriculum = (modules ?? []).map((m) => ({
      id: String(m.id),
      title: m.title,
      description: m.description ?? '',
      order: m.order,
      lessons: (lessonsMap[m.id] ?? []).map((l) => ({
        id: String(l['id']),
        title: String(l['title']),
        description: String(l['description'] ?? ''),
        durationMinutes: Number(l['duration_minutes'] ?? 0),
        isFree: Boolean(l['is_free']),
        order: Number(l['order']),
        resourceUrl: (l['resource_url'] as string) || undefined,
        resourceType: (l['resource_type'] as 'video' | 'file') || undefined,
        videoUrl: l['resource_type'] === 'video' ? (l['resource_url'] as string) : undefined
      }))
    }));

    const totalLessons =
      curriculum.reduce((sum, mod) => sum + mod.lessons.length, 0) || courseRow.total_lessons;

    return {
      id: String(courseRow.id),
      slug: courseRow.slug,
      title: courseRow.title,
      description: courseRow.description ?? '',
      category: this.mapCategory(courseRow.category),
      status: courseRow.status as Course['status'],
      thumbnailUrl: courseRow.thumbnail_url ?? undefined,
      price: Number(courseRow.price),
      originalPrice: Number(courseRow.original_price),
      durationMonths: courseRow.duration_months ?? 0,
      ...this.mapCourseMeta(courseRow as Record<string, unknown>),
      totalLessons,
      rating: Number(courseRow.rating),
      totalStudents: courseRow.total_students ?? 0,
      isResearchCourse: Boolean(courseRow.is_research_course),
      createdAt: courseRow.created_at,
      updatedAt: courseRow.created_at,
      curriculum,
      mentors: (mentors ?? []).map((m) => this.mapMentor(m as Record<string, unknown>))
    };
  }

  private mapListItem(r: Record<string, unknown>): CourseListItem {
    return {
      id: String(r['id']),
      slug: String(r['slug']),
      title: String(r['title']),
      category: this.mapCategory(r['category'] as string | null),
      status: r['status'] as CourseListItem['status'],
      thumbnailUrl: (r['thumbnail_url'] as string) || undefined,
      price: Number(r['price']),
      originalPrice: Number(r['original_price']),
      durationMonths: Number(r['duration_months']),
      ...this.mapCourseMeta(r),
      totalLessons: Number(r['total_lessons']),
      rating: Number(r['rating']),
      totalStudents: Number(r['total_students']),
      isResearchCourse: Boolean(r['is_research_course'])
    };
  }

  async enrollUser(courseId: string, userId: string): Promise<boolean> {
    if (await this.isUserEnrolled(courseId, userId)) return true;

    const { error } = await supabase.from('enrollments').insert({
      user_id: userId,
      course_id: courseId
    });

    if (error) {
      console.error('enrollUser error:', error);
      return false;
    }
    return true;
  }

  async getUserEnrolledCourses(userId: string): Promise<UserEnrolledCourse[]> {
    const { data: enrollments, error } = await supabase
      .from('enrollments')
      .select(
        `
        id, enrolled_at, course_id,
        courses (
          id, slug, title, category, thumbnail_url, total_lessons, live_class_count, hours_per_class
        )
      `
      )
      .eq('user_id', userId)
      .order('enrolled_at', { ascending: false });

    if (error || !enrollments?.length) {
      if (error) console.error('getUserEnrolledCourses error:', error);
      return [];
    }

    const courseIds = enrollments.map((e) => e.course_id as string);

    const { data: modules, error: modErr } = await supabase
      .from('course_curriculum')
      .select('course_id, course_lessons(id, order)')
      .in('course_id', courseIds);

    if (modErr) console.error('getUserEnrolledCourses modules error:', modErr);

    const lessonIdsByCourse: Record<string, string[]> = {};
    const allLessonIds: string[] = [];

    for (const mod of modules ?? []) {
      const courseId = mod.course_id as string;
      const lessons = (mod.course_lessons as Array<{ id: string; order: number }>) ?? [];
      lessons.sort((a, b) => a.order - b.order);
      for (const lesson of lessons) {
        lessonIdsByCourse[courseId] = lessonIdsByCourse[courseId] ?? [];
        lessonIdsByCourse[courseId].push(lesson.id);
        allLessonIds.push(lesson.id);
      }
    }

    let completedSet = new Set<string>();
    if (allLessonIds.length > 0) {
      const { data: progress } = await supabase
        .from('lesson_progress')
        .select('lesson_id')
        .eq('user_id', userId)
        .eq('completed', true)
        .in('lesson_id', allLessonIds);

      completedSet = new Set((progress ?? []).map((p) => p.lesson_id as string));
    }

    const results: UserEnrolledCourse[] = [];

    for (const row of enrollments) {
      const courseJoin = row.courses;
      const courseRaw = (Array.isArray(courseJoin) ? courseJoin[0] : courseJoin) as
        | Record<string, unknown>
        | null;
      if (!courseRaw) continue;

      const courseId = String(row.course_id);
      const lessonIds = lessonIdsByCourse[courseId] ?? [];
      const completed = lessonIds.filter((id) => completedSet.has(id)).length;
      const total = lessonIds.length || Number(courseRaw['total_lessons'] ?? 0);
      const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

      results.push({
        enrollmentId: String(row.id),
        courseId,
        slug: String(courseRaw['slug']),
        title: String(courseRaw['title']),
        category: this.mapCategory(courseRaw['category'] as string | null),
        thumbnailUrl: (courseRaw['thumbnail_url'] as string) || undefined,
        totalLessons: total,
        classCount:
          courseRaw['live_class_count'] != null
            ? Number(courseRaw['live_class_count'])
            : total,
        hoursPerClass:
          courseRaw['hours_per_class'] != null
            ? Number(courseRaw['hours_per_class'])
            : undefined,
        progress: progressPct,
        enrolledAt: row.enrolled_at as string,
        firstLessonId: lessonIds[0]
      });
    }

    return results;
  }

  async getUserEnrolledCourseIds(userId: string): Promise<Set<string>> {
    const { data, error } = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('user_id', userId);

    if (error) {
      console.error('getUserEnrolledCourseIds error:', error);
      return new Set();
    }

    return new Set((data ?? []).map((r) => String(r['course_id'])));
  }

  async isUserEnrolled(courseId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select('id')
        .eq('course_id', courseId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('isUserEnrolled error:', error);
        return false;
      }
      return !!data;
    } catch {
      return false;
    }
  }

  getFeaturedCourses(): Observable<CourseListItem[]> {
    return from(
      supabase
        .from('courses')
        .select(this.courseListFields)
        .eq('status', 'published')
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r) => this.mapListItem(r));
      }),
      catchError((err) => {
        console.error('getFeaturedCourses error:', err);
        return of([]);
      })
    );
  }
}
