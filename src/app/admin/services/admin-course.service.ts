import { Injectable } from '@angular/core';
import { CourseCategory, CourseFormat, CourseStatus } from '../../models';
import { supabase } from '../../core/supabase.client';

export interface AdminCourseRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  status: CourseStatus;
  price: number;
  originalPrice: number;
  durationMonths: number;
  durationDays: number | null;
  weeklyHours: number | null;
  liveClassCount: number | null;
  hoursPerClass: number | null;
  courseFormat: string | null;
  totalLessons: number;
  rating: number;
  totalStudents: number;
  isResearchCourse: boolean;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface AdminCourseInput {
  title: string;
  slug: string;
  description: string;
  category: CourseCategory;
  status: CourseStatus;
  price: number;
  originalPrice: number;
  durationMonths: number;
  durationDays?: number;
  weeklyHours?: number;
  classCount?: number;
  hoursPerClass?: number;
  courseFormat?: CourseFormat;
  totalLessons: number;
  rating: number;
  isResearchCourse: boolean;
  thumbnailUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminCourseService {
  private readonly fields =
    'id, slug, title, description, category, status, price, original_price, duration_months, duration_days, weekly_hours, live_class_count, hours_per_class, course_format, total_lessons, rating, total_students, is_research_course, thumbnail_url, created_at';

  async listAll(): Promise<AdminCourseRow[]> {
    const { data, error } = await supabase
      .from('courses')
      .select(this.fields)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('AdminCourseService.listAll:', error);
      return [];
    }

    return (data ?? []).map((r) => this.mapRow(r as Record<string, unknown>));
  }

  async getById(id: string): Promise<AdminCourseRow | null> {
    const { data, error } = await supabase
      .from('courses')
      .select(this.fields)
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapRow(data as Record<string, unknown>);
  }

  async create(input: AdminCourseInput): Promise<AdminCourseRow | null> {
    const { data, error } = await supabase
      .from('courses')
      .insert(this.toDb(input))
      .select(this.fields)
      .single();

    if (error) {
      console.error('AdminCourseService.create:', error);
      throw new Error(error.message);
    }

    return this.mapRow(data as Record<string, unknown>);
  }

  async update(id: string, input: AdminCourseInput): Promise<AdminCourseRow | null> {
    const { data, error } = await supabase
      .from('courses')
      .update(this.toDb(input))
      .eq('id', id)
      .select(this.fields)
      .single();

    if (error) {
      console.error('AdminCourseService.update:', error);
      throw new Error(error.message);
    }

    return this.mapRow(data as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) {
      console.error('AdminCourseService.delete:', error);
      return false;
    }
    return true;
  }

  async uploadThumbnail(courseId: string, file: File): Promise<string> {
    const path = `${courseId}/${crypto.randomUUID()}.jpg`;

    const { error } = await supabase.storage
      .from('course-thumbnails')
      .upload(path, file, { upsert: false, contentType: 'image/jpeg' });

    if (error) {
      console.error('AdminCourseService.uploadThumbnail:', error);
      throw new Error(error.message);
    }

    const { data } = supabase.storage.from('course-thumbnails').getPublicUrl(path);
    return data.publicUrl;
  }

  slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private toDb(input: AdminCourseInput): Record<string, unknown> {
    return {
      slug: input.slug,
      title: input.title,
      description: input.description,
      category: input.category,
      status: input.status,
      price: input.price,
      original_price: input.originalPrice,
      duration_months: input.durationMonths,
      duration_days: input.durationDays ?? null,
      weekly_hours: input.weeklyHours ?? null,
      live_class_count: input.classCount ?? null,
      hours_per_class: input.hoursPerClass ?? null,
      course_format: input.courseFormat ?? null,
      total_lessons: input.totalLessons,
      rating: input.rating,
      is_research_course: input.isResearchCourse,
      thumbnail_url: input.thumbnailUrl ?? null
    };
  }

  private mapRow(r: Record<string, unknown>): AdminCourseRow {
    return {
      id: String(r['id']),
      slug: String(r['slug']),
      title: String(r['title']),
      description: String(r['description'] ?? ''),
      category: String(r['category'] ?? 'technical'),
      status: r['status'] as CourseStatus,
      price: Number(r['price'] ?? 0),
      originalPrice: Number(r['original_price'] ?? 0),
      durationMonths: Number(r['duration_months'] ?? 0),
      durationDays: r['duration_days'] != null ? Number(r['duration_days']) : null,
      weeklyHours: r['weekly_hours'] != null ? Number(r['weekly_hours']) : null,
      liveClassCount: r['live_class_count'] != null ? Number(r['live_class_count']) : null,
      hoursPerClass: r['hours_per_class'] != null ? Number(r['hours_per_class']) : null,
      courseFormat: (r['course_format'] as string) ?? null,
      totalLessons: Number(r['total_lessons'] ?? 0),
      rating: Number(r['rating'] ?? 0),
      totalStudents: Number(r['total_students'] ?? 0),
      isResearchCourse: Boolean(r['is_research_course']),
      thumbnailUrl: (r['thumbnail_url'] as string) ?? null,
      createdAt: String(r['created_at'] ?? '')
    };
  }
}
