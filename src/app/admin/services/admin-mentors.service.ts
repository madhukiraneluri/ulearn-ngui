import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';
import { AdminCourseService } from './admin-course.service';

export interface AdminMentorRow {
  id: string;
  courseId: string;
  courseTitle: string;
  name: string;
  role: string;
  company: string;
  bio: string;
  avatarUrl: string | null;
  linkedInUrl: string | null;
}

export interface AdminMentorInput {
  courseId: string;
  name: string;
  role: string;
  company: string;
  bio: string;
  avatarUrl?: string;
  linkedInUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminMentorsService {
  constructor(private readonly courseService: AdminCourseService) {}

  private readonly fields =
    'id, course_id, name, role, company, bio, avatar_url, linked_in_url';

  async listByCourse(courseId: string): Promise<AdminMentorRow[]> {
    const course = await this.courseService.getById(courseId);
    const courseTitle = course?.title ?? 'Unknown course';

    const { data, error } = await supabase
      .from('course_mentors')
      .select(this.fields)
      .eq('course_id', courseId)
      .order('name', { ascending: true });

    if (error) {
      console.error('AdminMentorsService.listByCourse:', error);
      return [];
    }

    return (data ?? []).map((r) => this.mapRow(r as Record<string, unknown>, courseTitle));
  }

  async create(input: AdminMentorInput): Promise<AdminMentorRow | null> {
    const course = await this.courseService.getById(input.courseId);
    const courseTitle = course?.title ?? 'Unknown course';

    const { data, error } = await supabase
      .from('course_mentors')
      .insert(this.toDb(input))
      .select(this.fields)
      .single();

    if (error) {
      console.error('AdminMentorsService.create:', error);
      throw new Error(error.message);
    }

    return this.mapRow(data as Record<string, unknown>, courseTitle);
  }

  async update(id: string, input: AdminMentorInput): Promise<AdminMentorRow | null> {
    const course = await this.courseService.getById(input.courseId);
    const courseTitle = course?.title ?? 'Unknown course';

    const { data, error } = await supabase
      .from('course_mentors')
      .update(this.toDb(input))
      .eq('id', id)
      .select(this.fields)
      .single();

    if (error) {
      console.error('AdminMentorsService.update:', error);
      throw new Error(error.message);
    }

    return this.mapRow(data as Record<string, unknown>, courseTitle);
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase.from('course_mentors').delete().eq('id', id);
    if (error) {
      console.error('AdminMentorsService.delete:', error);
      return false;
    }
    return true;
  }

  private toDb(input: AdminMentorInput): Record<string, unknown> {
    return {
      course_id: input.courseId,
      name: input.name,
      role: input.role,
      company: input.company,
      bio: input.bio,
      avatar_url: input.avatarUrl?.trim() || null,
      linked_in_url: input.linkedInUrl?.trim() || null
    };
  }

  private mapRow(r: Record<string, unknown>, courseTitle: string): AdminMentorRow {
    return {
      id: String(r['id']),
      courseId: String(r['course_id']),
      courseTitle,
      name: String(r['name'] ?? ''),
      role: String(r['role'] ?? ''),
      company: String(r['company'] ?? ''),
      bio: String(r['bio'] ?? ''),
      avatarUrl: (r['avatar_url'] as string) ?? null,
      linkedInUrl: (r['linked_in_url'] as string) ?? null
    };
  }
}
