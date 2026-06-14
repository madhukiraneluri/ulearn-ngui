import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PaperCategory, ResearchPaper } from '../../models';
import { supabase } from '../../core/supabase.client';

@Injectable({ providedIn: 'root' })
export class PaperService {
  private readonly fields =
    'id, title, authors, abstract, category, status, venue, year, pdf_url, doi_url, citations, thumbnail_url, created_at';

  getPapers(): Observable<ResearchPaper[]> {
    return from(
      supabase
        .from('research_papers')
        .select(this.fields)
        .order('year', { ascending: false })
        .order('citations', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r) => this.mapRow(r as Record<string, unknown>));
      }),
      catchError((err) => {
        console.error('PaperService.getPapers:', err);
        return of([]);
      })
    );
  }

  getPapersByCategory(category: PaperCategory): Observable<ResearchPaper[]> {
    return from(
      supabase
        .from('research_papers')
        .select(this.fields)
        .eq('category', category)
        .order('citations', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r) => this.mapRow(r as Record<string, unknown>));
      }),
      catchError((err) => {
        console.error('PaperService.getPapersByCategory:', err);
        return of([]);
      })
    );
  }

  getFeaturedPapers(): Observable<ResearchPaper[]> {
    return from(
      supabase
        .from('research_papers')
        .select(this.fields)
        .eq('status', 'published')
        .order('citations', { ascending: false })
        .limit(3)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r) => this.mapRow(r as Record<string, unknown>));
      }),
      catchError((err) => {
        console.error('PaperService.getFeaturedPapers:', err);
        return of([]);
      })
    );
  }

  private mapRow(r: Record<string, unknown>): ResearchPaper {
    return {
      id: String(r['id']),
      title: String(r['title'] ?? ''),
      authors: Array.isArray(r['authors']) ? (r['authors'] as string[]) : [],
      abstract: String(r['abstract'] ?? ''),
      category: r['category'] as ResearchPaper['category'],
      status: r['status'] as ResearchPaper['status'],
      venue: String(r['venue'] ?? ''),
      year: Number(r['year'] ?? 0),
      pdfUrl: (r['pdf_url'] as string) || undefined,
      doiUrl: (r['doi_url'] as string) || undefined,
      citations: Number(r['citations'] ?? 0),
      thumbnailUrl: (r['thumbnail_url'] as string) || undefined,
      createdAt: String(r['created_at'] ?? '')
    };
  }
}
