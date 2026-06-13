import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { CourseListItem, Course, Mentor, CourseFormat } from '../../models';
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
    'id, slug, title, category, status, price, original_price, duration_months, duration_days, weekly_hours, live_class_count, course_format, total_lessons, rating, total_students, is_research_course, thumbnail_url';

  private readonly courseDetailFields =
    'id, slug, title, description, category, status, price, original_price, duration_months, duration_days, weekly_hours, live_class_count, course_format, total_lessons, rating, total_students, is_research_course, thumbnail_url, created_at';

  private mapFormat(raw: string | null): CourseFormat | undefined {
    if (raw === '45-day' || raw === '3-month') return raw;
    return undefined;
  }

  private mapCourseMeta(r: Record<string, unknown>) {
    return {
      durationDays: r['duration_days'] != null ? Number(r['duration_days']) : undefined,
      weeklyHours: r['weekly_hours'] != null ? Number(r['weekly_hours']) : undefined,
      liveClassCount: r['live_class_count'] != null ? Number(r['live_class_count']) : undefined,
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
