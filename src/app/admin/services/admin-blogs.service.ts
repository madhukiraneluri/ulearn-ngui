import { Injectable } from '@angular/core';
import { BlogStatus } from '../../models';
import { supabase } from '../../core/supabase.client';

export interface AdminBlogImageRow {
  id: string;
  blogId: string;
  url: string;
  caption: string | null;
  sortOrder: number;
}

export interface AdminBlogRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  coverImageUrl: string | null;
  eventDate: string | null;
  status: BlogStatus;
  createdAt: string;
  updatedAt: string;
  images: AdminBlogImageRow[];
}

export interface AdminBlogInput {
  slug: string;
  title: string;
  summary?: string;
  content: string;
  coverImageUrl?: string;
  eventDate?: string;
  status: BlogStatus;
}

@Injectable({ providedIn: 'root' })
export class AdminBlogsService {
  private readonly fields =
    'id, slug, title, summary, content, cover_image_url, event_date, status, created_at, updated_at, blog_images(id, blog_id, url, caption, sort_order)';

  async listAll(): Promise<AdminBlogRow[]> {
    const { data, error } = await supabase
      .from('blogs')
      .select(this.fields)
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('AdminBlogsService.listAll:', error);
      return [];
    }

    return (data ?? []).map((r) => this.mapRow(r as Record<string, unknown>));
  }

  async getById(id: string): Promise<AdminBlogRow | null> {
    const { data, error } = await supabase
      .from('blogs')
      .select(this.fields)
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapRow(data as Record<string, unknown>);
  }

  async create(input: AdminBlogInput): Promise<AdminBlogRow | null> {
    const { data, error } = await supabase
      .from('blogs')
      .insert(this.toDb(input))
      .select(this.fields)
      .single();

    if (error) {
      console.error('AdminBlogsService.create:', error);
      throw new Error(error.message);
    }

    return this.mapRow(data as Record<string, unknown>);
  }

  async update(id: string, input: AdminBlogInput): Promise<AdminBlogRow | null> {
    const { data, error } = await supabase
      .from('blogs')
      .update(this.toDb(input))
      .eq('id', id)
      .select(this.fields)
      .single();

    if (error) {
      console.error('AdminBlogsService.update:', error);
      throw new Error(error.message);
    }

    return this.mapRow(data as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase.from('blogs').delete().eq('id', id);
    if (error) {
      console.error('AdminBlogsService.delete:', error);
      return false;
    }
    return true;
  }

  async uploadImage(blogId: string, file: File): Promise<string> {
    const path = `${blogId}/${crypto.randomUUID()}.jpg`;

    const { error } = await supabase.storage
      .from('blog-images')
      .upload(path, file, { upsert: false, contentType: 'image/jpeg' });

    if (error) {
      console.error('AdminBlogsService.uploadImage:', error);
      throw new Error(error.message);
    }

    const { data } = supabase.storage.from('blog-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async addImage(
    blogId: string,
    url: string,
    caption?: string,
    sortOrder?: number
  ): Promise<AdminBlogImageRow | null> {
    const order =
      sortOrder ??
      (await this.nextSortOrder(blogId));

    const { data, error } = await supabase
      .from('blog_images')
      .insert({
        blog_id: blogId,
        url,
        caption: caption?.trim() || null,
        sort_order: order
      })
      .select('id, blog_id, url, caption, sort_order')
      .single();

    if (error) {
      console.error('AdminBlogsService.addImage:', error);
      throw new Error(error.message);
    }

    return this.mapImage(data as Record<string, unknown>);
  }

  async updateImage(
    id: string,
    updates: { caption?: string; sortOrder?: number }
  ): Promise<AdminBlogImageRow | null> {
    const payload: Record<string, unknown> = {};
    if (updates.caption !== undefined) payload['caption'] = updates.caption.trim() || null;
    if (updates.sortOrder !== undefined) payload['sort_order'] = updates.sortOrder;

    const { data, error } = await supabase
      .from('blog_images')
      .update(payload)
      .eq('id', id)
      .select('id, blog_id, url, caption, sort_order')
      .single();

    if (error) {
      console.error('AdminBlogsService.updateImage:', error);
      throw new Error(error.message);
    }

    return this.mapImage(data as Record<string, unknown>);
  }

  async deleteImage(id: string): Promise<boolean> {
    const { error } = await supabase.from('blog_images').delete().eq('id', id);
    if (error) {
      console.error('AdminBlogsService.deleteImage:', error);
      return false;
    }
    return true;
  }

  slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async nextSortOrder(blogId: string): Promise<number> {
    const { data } = await supabase
      .from('blog_images')
      .select('sort_order')
      .eq('blog_id', blogId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const max = data?.[0]?.sort_order;
    return typeof max === 'number' ? max + 1 : 0;
  }

  private toDb(input: AdminBlogInput): Record<string, unknown> {
    return {
      slug: input.slug.trim(),
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      content: input.content.trim(),
      cover_image_url: input.coverImageUrl?.trim() || null,
      event_date: input.eventDate?.trim() || null,
      status: input.status
    };
  }

  private mapRow(r: Record<string, unknown>): AdminBlogRow {
    const rawImages = (r['blog_images'] as Record<string, unknown>[] | null) ?? [];
    const images = rawImages
      .map((img) => this.mapImage(img))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      id: String(r['id']),
      slug: String(r['slug'] ?? ''),
      title: String(r['title'] ?? ''),
      summary: (r['summary'] as string) ?? null,
      content: String(r['content'] ?? ''),
      coverImageUrl: (r['cover_image_url'] as string) ?? null,
      eventDate: (r['event_date'] as string) ?? null,
      status: (r['status'] as BlogStatus) ?? 'draft',
      createdAt: String(r['created_at'] ?? ''),
      updatedAt: String(r['updated_at'] ?? ''),
      images
    };
  }

  private mapImage(r: Record<string, unknown>): AdminBlogImageRow {
    return {
      id: String(r['id']),
      blogId: String(r['blog_id']),
      url: String(r['url'] ?? ''),
      caption: (r['caption'] as string) ?? null,
      sortOrder: Number(r['sort_order'] ?? 0)
    };
  }
}
