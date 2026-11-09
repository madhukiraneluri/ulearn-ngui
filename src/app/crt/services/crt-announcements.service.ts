import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export interface CrtStudentAnnouncement {
  id: string;
  title: string;
  body: string;
  drive_date: string | null;
  published_at: string;
}

const STUDENT_ROW_FIELDS = 'id, title, body, drive_date, published_at';
const LATEST_PUBLISHED_LIMIT = 5;

@Injectable({ providedIn: 'root' })
export class CrtStudentAnnouncementsService {
  async listLatestPublished(
    limit = LATEST_PUBLISHED_LIMIT,
  ): Promise<CrtStudentAnnouncement[]> {
    const { data, error } = await supabase
      .from('crt_announcements')
      .select(STUDENT_ROW_FIELDS)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []) as CrtStudentAnnouncement[];
  }
}
