import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export interface CrtMentorDashboardPathOption {
  id: string;
  title: string;
}

export interface CrtMentorDashboardBatchOption {
  id: string;
  name: string;
  paths: CrtMentorDashboardPathOption[];
}

export interface CrtMentorDashboardFilterMeta {
  batches: CrtMentorDashboardBatchOption[];
}

export interface CrtMentorDashboardRow {
  userId: string;
  studentName: string;
  email: string | null;
  batchId: string;
  batchName: string;
  pathId: string;
  pathTitle: string;
  lastAttemptAt: string | null;
  readinessScore: number;
  status: 'active' | 'inactive';
}

export interface CrtMentorDashboardPage {
  offset: number;
  limit: number;
  total: number;
}

export interface CrtMentorDashboardReport {
  page: CrtMentorDashboardPage;
  rows: CrtMentorDashboardRow[];
}

export interface CrtMentorDashboardReportQuery {
  batchId: string | null;
  pathId: string | null;
  readinessBelow: number | null;
  inactiveDays: number | null;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class CrtMentorDashboardService {
  async loadFilters(): Promise<CrtMentorDashboardFilterMeta> {
    const { data, error } = await supabase.rpc('crt_mentor_dashboard_filters');
    if (error) throw new Error(mentorDashboardErrorMessage(error.message));
    return parseFilterMeta(data);
  }

  async report(query: CrtMentorDashboardReportQuery): Promise<CrtMentorDashboardReport> {
    const { data, error } = await supabase.rpc('crt_mentor_dashboard_report', {
      p_batch_id: query.batchId,
      p_path_id: query.pathId,
      p_readiness_below: query.readinessBelow,
      p_inactive_days: query.inactiveDays,
      p_limit: query.limit,
      p_offset: query.offset,
    });
    if (error) throw new Error(mentorDashboardErrorMessage(error.message));
    return parseReport(data);
  }
}

export function mentorDashboardErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('forbidden') || text.includes('42501')) {
    return 'You do not have access to the CRT mentor dashboard.';
  }
  if (text.includes('unauthenticated') || text.includes('28000')) {
    return 'Sign in again to view the CRT mentor dashboard.';
  }
  if (text.includes('invalid readiness_below')) {
    return 'Readiness threshold must be between 0 and 100.';
  }
  if (text.includes('invalid inactive_days')) {
    return 'Inactive days must be zero or greater.';
  }
  if (text.includes('path is not assigned to batch')) {
    return 'That learning path is not assigned to the selected batch.';
  }
  return message || 'Could not load the CRT mentor dashboard.';
}

function parseFilterMeta(value: unknown): CrtMentorDashboardFilterMeta {
  const record = asRecord(value);
  return {
    batches: objectList(record['batches']).flatMap((item) => {
      const id = text(item['id']);
      const name = text(item['name']);
      if (!id || !name) return [];
      const paths = objectList(item['paths']).flatMap((pathRow) => {
        const pathId = text(pathRow['id']);
        const title = text(pathRow['title']);
        return pathId && title ? [{ id: pathId, title }] : [];
      });
      return [{ id, name, paths }];
    }),
  };
}

function parseReport(value: unknown): CrtMentorDashboardReport {
  const record = asRecord(value);
  const page = asRecord(record['page']);
  return {
    page: {
      offset: count(page['offset']),
      limit: count(page['limit']),
      total: count(page['total']),
    },
    rows: objectList(record['rows']).map(parseRow),
  };
}

function parseRow(value: Record<string, unknown>): CrtMentorDashboardRow {
  const statusRaw = text(value['status']);
  const status: 'active' | 'inactive' =
    statusRaw === 'active' ? 'active' : 'inactive';
  return {
    userId: text(value['userId']) ?? '',
    studentName: text(value['studentName']) ?? 'Unnamed user',
    email: text(value['email']),
    batchId: text(value['batchId']) ?? '',
    batchName: text(value['batchName']) ?? 'Unknown batch',
    pathId: text(value['pathId']) ?? '',
    pathTitle: text(value['pathTitle']) ?? 'Unknown path',
    lastAttemptAt: text(value['lastAttemptAt']),
    readinessScore: count(value['readinessScore']),
    status,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function objectList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === 'object' && !Array.isArray(item),
  );
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function count(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}
