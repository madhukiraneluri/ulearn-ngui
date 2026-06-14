import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Internship, InternshipType } from '../../models';
import { supabase } from '../../core/supabase.client';

@Injectable({ providedIn: 'root' })
export class InternshipService {
  private readonly fields =
    'id, title, type, mode, domain, description, duration_label, stipend_per_month, has_ppo, skills, thumbnail_url, status, created_at';

  getInternships(): Observable<Internship[]> {
    return from(
      supabase
        .from('internships')
        .select(this.fields)
        .eq('status', 'open')
        .order('stipend_per_month', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r) => this.mapRow(r as Record<string, unknown>));
      }),
      catchError((err) => {
        console.error('InternshipService.getInternships:', err);
        return of([]);
      })
    );
  }

  getInternshipsByType(type: InternshipType): Observable<Internship[]> {
    return from(
      supabase
        .from('internships')
        .select(this.fields)
        .eq('status', 'open')
        .eq('type', type)
        .order('stipend_per_month', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r) => this.mapRow(r as Record<string, unknown>));
      }),
      catchError((err) => {
        console.error('InternshipService.getInternshipsByType:', err);
        return of([]);
      })
    );
  }

  getInternshipById(id: string): Observable<Internship | null> {
    return from(
      supabase.from('internships').select(this.fields).eq('id', id).maybeSingle()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) return null;
        return this.mapRow(data as Record<string, unknown>);
      }),
      catchError((err) => {
        console.error('InternshipService.getInternshipById:', err);
        return of(null);
      })
    );
  }

  private mapRow(r: Record<string, unknown>): Internship {
    return {
      id: String(r['id']),
      title: String(r['title'] ?? ''),
      type: r['type'] as Internship['type'],
      mode: r['mode'] as Internship['mode'],
      domain: String(r['domain'] ?? ''),
      description: String(r['description'] ?? ''),
      durationLabel: String(r['duration_label'] ?? ''),
      stipendPerMonth: Number(r['stipend_per_month'] ?? 0),
      hasPPO: Boolean(r['has_ppo']),
      skills: Array.isArray(r['skills']) ? (r['skills'] as string[]) : [],
      thumbnailUrl: (r['thumbnail_url'] as string) || undefined,
      status: (r['status'] as Internship['status']) ?? 'open',
      createdAt: String(r['created_at'] ?? '')
    };
  }
}
