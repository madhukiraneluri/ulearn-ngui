import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { StudentStory } from '../../models';
import { supabase } from '../../core/supabase.client';

@Injectable({ providedIn: 'root' })
export class StudentStoryService {
  private readonly fields =
    'id, student_name, photo_url, college_name, current_role, impression, sort_order, is_published, created_at, updated_at';

  getPublishedStories(): Observable<StudentStory[]> {
    return from(
      supabase
        .from('student_stories')
        .select(this.fields)
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r) => this.mapRow(r as Record<string, unknown>));
      }),
      catchError((err) => {
        console.error('StudentStoryService.getPublishedStories:', err);
        return of([]);
      })
    );
  }

  private mapRow(r: Record<string, unknown>): StudentStory {
    return {
      id: String(r['id']),
      studentName: String(r['student_name'] ?? ''),
      photoUrl: (r['photo_url'] as string) || undefined,
      collegeName: String(r['college_name'] ?? ''),
      currentRole: (r['current_role'] as string) || undefined,
      impression: String(r['impression'] ?? ''),
      sortOrder: Number(r['sort_order'] ?? 0),
      isPublished: Boolean(r['is_published']),
      createdAt: String(r['created_at'] ?? ''),
      updatedAt: String(r['updated_at'] ?? '')
    };
  }
}
