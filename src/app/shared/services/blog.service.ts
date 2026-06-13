import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Blog, BlogImage, BlogListItem } from '../../models';
import { supabase } from '../../core/supabase.client';

@Injectable({ providedIn: 'root' })
export class BlogService {
  private readonly listFields =
    'id, slug, title, summary, cover_image_url, event_date, created_at, blog_images(url, sort_order)';

  private readonly detailFields =
    'id, slug, title, summary, content, cover_image_url, event_date, status, created_at, updated_at, blog_images(id, url, caption, sort_order)';

  getBlogs(): Observable<BlogListItem[]> {
    return from(
      supabase
        .from('blogs')
        .select(this.listFields)
        .eq('status', 'published')
        .order('event_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((r) => this.mapListItem(r as Record<string, unknown>));
      }),
      catchError((err) => {
        console.error('BlogService.getBlogs:', err);
        return of([]);
      })
    );
  }

  getFeaturedBlogs(limit = 3): Observable<BlogListItem[]> {
    return this.getBlogs().pipe(map((items) => items.slice(0, limit)));
  }

  getBlogBySlug(slug: string): Observable<Blog | null> {
    return from(
      supabase
        .from('blogs')
        .select(this.detailFields)
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) return null;
        return this.mapBlog(data as Record<string, unknown>);
      }),
      catchError((err) => {
        console.error('BlogService.getBlogBySlug:', err);
        return of(null);
      })
    );
  }

  private mapListItem(r: Record<string, unknown>): BlogListItem {
    const cover = (r['cover_image_url'] as string) || undefined;
    const thumbnailUrl = cover || this.firstGalleryUrl(r['blog_images']);

    return {
      id: String(r['id']),
      slug: String(r['slug'] ?? ''),
      title: String(r['title'] ?? ''),
      summary: (r['summary'] as string) || undefined,
      coverImageUrl: cover,
      thumbnailUrl,
      eventDate: (r['event_date'] as string) || undefined,
      createdAt: String(r['created_at'] ?? '')
    };
  }

  private firstGalleryUrl(raw: unknown): string | undefined {
    const images = (raw as Record<string, unknown>[] | null) ?? [];
    if (images.length === 0) return undefined;
    const sorted = [...images].sort(
      (a, b) => Number(a['sort_order'] ?? 0) - Number(b['sort_order'] ?? 0)
    );
    const url = sorted[0]?.['url'];
    return typeof url === 'string' && url.length > 0 ? url : undefined;
  }

  private mapBlog(r: Record<string, unknown>): Blog {
    const rawImages = (r['blog_images'] as Record<string, unknown>[] | null) ?? [];
    const images: BlogImage[] = rawImages
      .map((img) => ({
        id: String(img['id']),
        url: String(img['url'] ?? ''),
        caption: (img['caption'] as string) || undefined,
        order: Number(img['sort_order'] ?? 0)
      }))
      .sort((a, b) => a.order - b.order);

    return {
      id: String(r['id']),
      slug: String(r['slug'] ?? ''),
      title: String(r['title'] ?? ''),
      summary: (r['summary'] as string) || undefined,
      content: String(r['content'] ?? ''),
      coverImageUrl: (r['cover_image_url'] as string) || undefined,
      images,
      eventDate: (r['event_date'] as string) || undefined,
      status: (r['status'] as Blog['status']) ?? 'published',
      createdAt: String(r['created_at'] ?? ''),
      updatedAt: String(r['updated_at'] ?? '')
    };
  }
}
