import { Injectable } from '@angular/core';
import { InternshipApplicationStatus } from '../../models';
import { supabase } from '../../core/supabase.client';

export interface InternshipApplicationRow {
  applicationId: string;
  internshipId: string;
  internshipTitle: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  status: InternshipApplicationStatus;
  appliedAt: string;
}

export interface InternshipApplicationSummary {
  internshipId: string;
  internshipTitle: string;
  totalApplications: number;
  applications: InternshipApplicationRow[];
}

interface ProfileLookup {
  id: string;
  full_name: string | null;
  email: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminInternshipApplicationsService {
  async listAll(): Promise<InternshipApplicationRow[]> {
    const { data, error } = await supabase
      .from('internship_applications')
      .select('id, internship_id, user_id, status, applied_at, internships(title)')
      .order('applied_at', { ascending: false });

    if (error) {
      console.error('AdminInternshipApplicationsService.listAll:', error);
      return [];
    }

    const rows = data ?? [];
    if (rows.length === 0) return [];

    const userIds = [...new Set(rows.map((r) => String(r.user_id)))];
    const profileMap = await this.loadProfiles(userIds);

    return rows.map((row) => {
      const userId = String(row.user_id);
      const profile = profileMap.get(userId);
      const internshipRaw = row.internships;
      const internship = Array.isArray(internshipRaw) ? internshipRaw[0] : internshipRaw;

      return {
        applicationId: String(row.id),
        internshipId: String(row.internship_id),
        internshipTitle: String(
          (internship as { title?: string } | null)?.title ?? 'Unknown internship'
        ),
        userId,
        userName: String(profile?.full_name ?? 'Unnamed user'),
        userEmail: profile?.email ?? null,
        status: row.status as InternshipApplicationStatus,
        appliedAt: String(row.applied_at)
      };
    });
  }

  async getApplicationsForInternship(
    internshipId: string,
    internshipTitle: string
  ): Promise<InternshipApplicationSummary> {
    const { data, error } = await supabase
      .from('internship_applications')
      .select('id, internship_id, user_id, status, applied_at')
      .eq('internship_id', internshipId)
      .order('applied_at', { ascending: false });

    if (error) {
      console.error('AdminInternshipApplicationsService.getApplicationsForInternship:', error);
      return {
        internshipId,
        internshipTitle,
        totalApplications: 0,
        applications: []
      };
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return {
        internshipId,
        internshipTitle,
        totalApplications: 0,
        applications: []
      };
    }

    const userIds = rows.map((r) => String(r.user_id));
    const profileMap = await this.loadProfiles(userIds);

    const applications: InternshipApplicationRow[] = rows.map((row) => {
      const userId = String(row.user_id);
      const profile = profileMap.get(userId);
      return {
        applicationId: String(row.id),
        internshipId: String(row.internship_id),
        internshipTitle,
        userId,
        userName: String(profile?.full_name ?? 'Unnamed user'),
        userEmail: profile?.email ?? null,
        status: row.status as InternshipApplicationStatus,
        appliedAt: String(row.applied_at)
      };
    });

    return {
      internshipId,
      internshipTitle,
      totalApplications: applications.length,
      applications
    };
  }

  async updateStatus(
    applicationId: string,
    status: InternshipApplicationStatus
  ): Promise<boolean> {
    const { error } = await supabase
      .from('internship_applications')
      .update({ status })
      .eq('id', applicationId);

    if (error) {
      console.error('AdminInternshipApplicationsService.updateStatus:', error);
      return false;
    }
    return true;
  }

  async getApplicationCount(): Promise<number> {
    const { count, error } = await supabase
      .from('internship_applications')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('AdminInternshipApplicationsService.getApplicationCount:', error);
      return 0;
    }
    return count ?? 0;
  }

  private async loadProfiles(userIds: string[]): Promise<Map<string, ProfileLookup>> {
    const map = new Map<string, ProfileLookup>();
    if (userIds.length === 0) return map;

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    for (const p of data ?? []) {
      map.set(String(p.id), {
        id: String(p.id),
        full_name: p.full_name as string | null,
        email: p.email as string | null
      });
    }
    return map;
  }
}
