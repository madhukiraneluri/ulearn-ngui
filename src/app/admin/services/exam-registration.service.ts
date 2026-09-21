import { Injectable } from '@angular/core';
import { supabase, invokeAuthedFunction } from '../../core/supabase.client';
import type { ExamRegistration, ExamResultRow } from '../../models/index';

interface RegistrationRow {
  id: string;
  email: string;
  full_name: string;
  role_interested: string;
  role_slug: string | null;
  exam_id: string | null;
  user_id: string | null;
  candidate_id: string | null;
  import_batch_id: string | null;
  credentials_sent_at: string | null;
  provision_error: string | null;
  created_at: string;
  exams?: { title: string } | { title: string }[] | null;
}

interface ResultRow {
  id: string;
  attempt_id: string;
  exam_id: string;
  user_id: string;
  role_slug: string;
  student_name: string;
  student_email: string;
  mcq_score: number;
  mcq_max: number;
  coding_score: number;
  coding_max: number;
  total_score: number;
  total_max: number;
  percentage: number;
  fullscreen_warnings: number;
  evaluated_at: string;
}

export interface RegistrationListParams {
  page: number;
  pageSize: number;
  search?: string;
  roleSlug?: string;
  emailStatus?: 'all' | 'sent' | 'pending';
  examId?: string;
}

export interface RegistrationListResult {
  rows: ExamRegistration[];
  total: number;
}

function mapRegistration(row: RegistrationRow): ExamRegistration {
  const exam = Array.isArray(row.exams) ? row.exams[0] : row.exams;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    roleInterested: row.role_interested,
    roleSlug: row.role_slug,
    examId: row.exam_id,
    userId: row.user_id,
    candidateId: row.candidate_id,
    importBatchId: row.import_batch_id,
    credentialsSentAt: row.credentials_sent_at,
    provisionError: row.provision_error,
    createdAt: row.created_at,
    examTitle: exam?.title
  };
}

function mapResult(row: ResultRow): ExamResultRow {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    examId: row.exam_id,
    userId: row.user_id,
    roleSlug: row.role_slug,
    studentName: row.student_name,
    studentEmail: row.student_email,
    mcqScore: Number(row.mcq_score),
    mcqMax: Number(row.mcq_max),
    codingScore: Number(row.coding_score),
    codingMax: Number(row.coding_max),
    totalScore: Number(row.total_score),
    totalMax: Number(row.total_max),
    percentage: Number(row.percentage),
    fullscreenWarnings: row.fullscreen_warnings,
    evaluatedAt: row.evaluated_at
  };
}

@Injectable({ providedIn: 'root' })
export class ExamRegistrationService {
  async listRegistrations(params: RegistrationListParams): Promise<RegistrationListResult> {
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let query = supabase
      .from('exam_registrations')
      .select('*, exams(title)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (params.search?.trim()) {
      const q = params.search.trim();
      query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%,role_interested.ilike.%${q}%`);
    }
    if (params.roleSlug) query = query.eq('role_slug', params.roleSlug);
    if (params.examId) query = query.eq('exam_id', params.examId);
    if (params.emailStatus === 'sent') query = query.not('credentials_sent_at', 'is', null);
    if (params.emailStatus === 'pending') query = query.is('credentials_sent_at', null);

    const { data, error, count } = await query.range(from, to);
    if (error) throw new Error(error.message);

    return {
      rows: ((data ?? []) as RegistrationRow[]).map(mapRegistration),
      total: count ?? 0
    };
  }

  async importFromExcel(
    registrations: Array<{ email: string; fullName: string; roleInterested: string }>,
    importBatchId?: string
  ): Promise<{ summary: { total: number; success: number; failed: number }; importBatchId: string }> {
    const { data, error } = await invokeAuthedFunction<{
      summary: { total: number; success: number; failed: number };
      importBatchId: string;
    }>('import-exam-registrations', { registrations, importBatchId });

    if (error) throw new Error(error instanceof Error ? error.message : 'Import failed');
    if (!data) throw new Error('Import failed');
    return data;
  }

  async deleteAllRegistrations(): Promise<void> {
    const { data, error } = await invokeAuthedFunction<{ ok: boolean }>('delete-exam-registrations', {});

    if (error) throw new Error(error instanceof Error ? error.message : 'Delete failed');
    if (!data?.ok) throw new Error('Delete failed');
  }

  async sendCredentials(options: {
    registrationIds?: string[];
    examId?: string;
    onlyUnsent?: boolean;
  }): Promise<{ summary: { total: number; sent: number; failed: number } }> {
    const { data, error } = await invokeAuthedFunction<{
      summary: { total: number; sent: number; failed: number };
    }>('send-exam-credentials', options);

    if (error) throw new Error(error instanceof Error ? error.message : 'Send failed');
    if (!data) throw new Error('Send failed');
    return data;
  }

  async listResults(examId?: string, roleSlug?: string): Promise<ExamResultRow[]> {
    let query = supabase.from('exam_results').select('*').order('evaluated_at', { ascending: false });
    if (examId) query = query.eq('exam_id', examId);
    if (roleSlug) query = query.eq('role_slug', roleSlug);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ((data ?? []) as ResultRow[]).map(mapResult);
  }

  async getMyResult(userId: string, examId: string): Promise<ExamResultRow | null> {
    const { data, error } = await supabase
      .from('exam_results')
      .select('*')
      .eq('user_id', userId)
      .eq('exam_id', examId)
      .order('evaluated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapResult(data as ResultRow) : null;
  }
}
