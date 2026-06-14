import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export interface AdminStudentStoryRow {
  id: string;
  studentName: string;
  photoUrl: string | null;
  collegeName: string;
  currentRole: string | null;
  impression: string;
  sortOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminStudentStoryInput {
  studentName: string;
  photoUrl?: string;
  collegeName: string;
  currentRole?: string;
  impression: string;
  sortOrder: number;
  isPublished: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminStudentStoriesService {
  private readonly fields =
    'id, student_name, photo_url, college_name, current_role, impression, sort_order, is_published, created_at, updated_at';

  async listAll(): Promise<AdminStudentStoryRow[]> {
    const { data, error } = await supabase
      .from('student_stories')
      .select(this.fields)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('AdminStudentStoriesService.listAll:', error);
      return [];
    }

    return (data ?? []).map((r) => this.mapRow(r as Record<string, unknown>));
  }

  async create(input: AdminStudentStoryInput): Promise<AdminStudentStoryRow | null> {
    const { data, error } = await supabase
      .from('student_stories')
      .insert(this.toDb(input))
      .select(this.fields)
      .single();

    if (error) throw new Error(error.message);
    return this.mapRow(data as Record<string, unknown>);
  }

  async update(id: string, input: AdminStudentStoryInput): Promise<AdminStudentStoryRow | null> {
    const { data, error } = await supabase
      .from('student_stories')
      .update(this.toDb(input))
      .eq('id', id)
      .select(this.fields)
      .single();

    if (error) throw new Error(error.message);
    return this.mapRow(data as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase.from('student_stories').delete().eq('id', id);
    return !error;
  }

  async uploadPhoto(storyId: string, file: File): Promise<string> {
    const path = `${storyId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from('student-story-photos')
      .upload(path, file, { upsert: false, contentType: 'image/jpeg' });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from('student-story-photos').getPublicUrl(path);
    return data.publicUrl;
  }

  private toDb(input: AdminStudentStoryInput): Record<string, unknown> {
    return {
      student_name: input.studentName.trim(),
      photo_url: input.photoUrl?.trim() || null,
      college_name: input.collegeName.trim(),
      current_role: input.currentRole?.trim() || null,
      impression: input.impression.trim(),
      sort_order: input.sortOrder,
      is_published: input.isPublished
    };
  }

  private mapRow(r: Record<string, unknown>): AdminStudentStoryRow {
    return {
      id: String(r['id']),
      studentName: String(r['student_name'] ?? ''),
      photoUrl: (r['photo_url'] as string) ?? null,
      collegeName: String(r['college_name'] ?? ''),
      currentRole: (r['current_role'] as string) ?? null,
      impression: String(r['impression'] ?? ''),
      sortOrder: Number(r['sort_order'] ?? 0),
      isPublished: Boolean(r['is_published']),
      createdAt: String(r['created_at'] ?? ''),
      updatedAt: String(r['updated_at'] ?? '')
    };
  }
}
