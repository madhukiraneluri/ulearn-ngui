import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export type CrtAnnouncementStatus = 'draft' | 'published';

export interface CrtAnnouncement {
  id: string;
  title: string;
  body: string;
  status: CrtAnnouncementStatus;
  drive_date: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrtAnnouncementCreateInput {
  title: string;
  body: string;
  drive_date?: string | null;
}

export interface CrtAnnouncementUpdateInput {
  title: string;
  body: string;
  drive_date?: string | null;
}

const ROW_FIELDS =
  'id, title, body, status, drive_date, published_at, created_by, created_at, updated_at';

@Injectable({ providedIn: 'root' })
export class CrtAnnouncementsService {
  async listAnnouncements(): Promise<CrtAnnouncement[]> {
    const { data, error } = await supabase
      .from('crt_announcements')
      .select(ROW_FIELDS)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as CrtAnnouncement[];
  }

  async createAnnouncement(
    input: CrtAnnouncementCreateInput,
  ): Promise<CrtAnnouncement> {
    const createdBy = await this.resolveCreatedBy();

    const { data, error } = await supabase
      .from('crt_announcements')
      .insert({
        title: input.title.trim(),
        body: input.body.trim(),
        drive_date: this.normalizeDriveDate(input.drive_date),
        status: 'draft',
        published_at: null,
        created_by: createdBy,
      })
      .select(ROW_FIELDS)
      .single();

    if (error) throw new Error(error.message);
    return data as CrtAnnouncement;
  }

  async updateAnnouncement(
    id: string,
    input: CrtAnnouncementUpdateInput,
  ): Promise<CrtAnnouncement> {
    const { data, error } = await supabase
      .from('crt_announcements')
      .update({
        title: input.title.trim(),
        body: input.body.trim(),
        drive_date: this.normalizeDriveDate(input.drive_date),
      })
      .eq('id', id)
      .select(ROW_FIELDS)
      .single();

    if (error) throw new Error(error.message);
    return data as CrtAnnouncement;
  }

  async publishAnnouncement(id: string): Promise<CrtAnnouncement> {
    const publishedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from('crt_announcements')
      .update({
        status: 'published',
        published_at: publishedAt,
      })
      .eq('id', id)
      .select(ROW_FIELDS)
      .single();

    if (error) throw new Error(error.message);
    return data as CrtAnnouncement;
  }

  async unpublishAnnouncement(id: string): Promise<CrtAnnouncement> {
    const { data, error } = await supabase
      .from('crt_announcements')
      .update({
        status: 'draft',
        published_at: null,
      })
      .eq('id', id)
      .select(ROW_FIELDS)
      .single();

    if (error) throw new Error(error.message);
    return data as CrtAnnouncement;
  }

  async deleteAnnouncement(id: string): Promise<void> {
    const { error } = await supabase
      .from('crt_announcements')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  private async resolveCreatedBy(): Promise<string | null> {
    const { data: user } = await supabase.auth.getUser();
    return user.user?.id ?? null;
  }

  private normalizeDriveDate(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
