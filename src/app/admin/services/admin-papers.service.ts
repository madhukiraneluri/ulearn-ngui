import { Injectable } from '@angular/core';
import { PaperCategory, PaperStatus } from '../../models';
import { supabase } from '../../core/supabase.client';

export interface AdminPaperRow {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  category: PaperCategory;
  status: PaperStatus;
  venue: string;
  year: number;
  pdfUrl: string | null;
  doiUrl: string | null;
  citations: number;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPaperInput {
  title: string;
  authors: string[];
  abstract: string;
  category: PaperCategory;
  status: PaperStatus;
  venue: string;
  year: number;
  pdfUrl?: string;
  doiUrl?: string;
  citations: number;
  thumbnailUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminPapersService {
  private readonly fields =
    'id, title, authors, abstract, category, status, venue, year, pdf_url, doi_url, citations, thumbnail_url, created_at, updated_at';

  async listAll(): Promise<AdminPaperRow[]> {
    const { data, error } = await supabase
      .from('research_papers')
      .select(this.fields)
      .order('year', { ascending: false })
      .order('citations', { ascending: false });

    if (error) {
      console.error('AdminPapersService.listAll:', error);
      return [];
    }

    return (data ?? []).map((r) => this.mapRow(r as Record<string, unknown>));
  }

  async create(input: AdminPaperInput): Promise<AdminPaperRow | null> {
    const { data, error } = await supabase
      .from('research_papers')
      .insert(this.toDb(input))
      .select(this.fields)
      .single();

    if (error) throw new Error(error.message);
    return this.mapRow(data as Record<string, unknown>);
  }

  async update(id: string, input: AdminPaperInput): Promise<AdminPaperRow | null> {
    const { data, error } = await supabase
      .from('research_papers')
      .update(this.toDb(input))
      .eq('id', id)
      .select(this.fields)
      .single();

    if (error) throw new Error(error.message);
    return this.mapRow(data as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase.from('research_papers').delete().eq('id', id);
    return !error;
  }

  async uploadThumbnail(paperId: string, file: File): Promise<string> {
    const path = `${paperId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from('paper-thumbnails')
      .upload(path, file, { upsert: false, contentType: 'image/jpeg' });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from('paper-thumbnails').getPublicUrl(path);
    return data.publicUrl;
  }

  private toDb(input: AdminPaperInput): Record<string, unknown> {
    return {
      title: input.title.trim(),
      authors: input.authors,
      abstract: input.abstract.trim(),
      category: input.category,
      status: input.status,
      venue: input.venue.trim(),
      year: input.year,
      pdf_url: input.pdfUrl?.trim() || null,
      doi_url: input.doiUrl?.trim() || null,
      citations: input.citations,
      thumbnail_url: input.thumbnailUrl?.trim() || null
    };
  }

  private mapRow(r: Record<string, unknown>): AdminPaperRow {
    return {
      id: String(r['id']),
      title: String(r['title'] ?? ''),
      authors: Array.isArray(r['authors']) ? (r['authors'] as string[]) : [],
      abstract: String(r['abstract'] ?? ''),
      category: r['category'] as PaperCategory,
      status: r['status'] as PaperStatus,
      venue: String(r['venue'] ?? ''),
      year: Number(r['year'] ?? 0),
      pdfUrl: (r['pdf_url'] as string) ?? null,
      doiUrl: (r['doi_url'] as string) ?? null,
      citations: Number(r['citations'] ?? 0),
      thumbnailUrl: (r['thumbnail_url'] as string) ?? null,
      createdAt: String(r['created_at'] ?? ''),
      updatedAt: String(r['updated_at'] ?? '')
    };
  }
}
