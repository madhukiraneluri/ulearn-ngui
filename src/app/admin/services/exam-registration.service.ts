import { Injectable } from '@angular/core';
import { supabase, invokeAuthedFunction } from '../../core/supabase.client';
import { EXAM_ROLE_DEFINITIONS } from '../exam-portal/exam-role.config';
import type {
  ExamAnswer,
  ExamCodingBreakdownItem,
  ExamMcqBreakdownItem,
  ExamQuestion,
  ExamRegistration,
  ExamNotAttendedRow,
  ExamPortalStats,
  ExamResultDetail,
  ExamResultQuestionReview,
  ExamResultRow
} from '../../models/index';

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
  mcq_breakdown?: ExamMcqBreakdownItem[] | null;
  coding_breakdown?: ExamCodingBreakdownItem[] | null;
  evaluated_at: string;
  exam_attempts?:
    | {
        started_at: string;
        submitted_at: string | null;
        status: string;
        ends_at: string;
      }
    | {
        started_at: string;
        submitted_at: string | null;
        status: string;
        ends_at: string;
      }[]
    | null;
}

interface ExamQuestionRow {
  id: string;
  exam_role_id: string;
  type: 'mcq' | 'coding';
  sort_order: number;
  payload: ExamQuestion['payload'];
  created_at: string;
}

interface ExamAnswerRow {
  id: string;
  attempt_id: string;
  question_id: string;
  answer: Record<string, unknown>;
  answered_at: string;
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

export interface SendCredentialsRowResult {
  registrationId: string;
  email: string;
  success: boolean;
  message: string;
  tempPassword?: string;
}

export interface SendCredentialsResult {
  summary: { total: number; sent: number; failed: number };
  results: SendCredentialsRowResult[];
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

function mapQuestion(row: ExamQuestionRow): ExamQuestion {
  return {
    id: row.id,
    examRoleId: row.exam_role_id,
    type: row.type,
    sortOrder: row.sort_order,
    payload: row.payload,
    createdAt: row.created_at
  };
}

function mapAnswer(row: ExamAnswerRow): ExamAnswer {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    questionId: row.question_id,
    answer: row.answer,
    answeredAt: row.answered_at
  };
}

function mapResult(row: ResultRow): ExamResultRow {
  const attemptRaw = row.exam_attempts;
  const attempt = Array.isArray(attemptRaw) ? attemptRaw[0] : attemptRaw;
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
    evaluatedAt: row.evaluated_at,
    attemptStartedAt: attempt?.started_at ?? null,
    attemptSubmittedAt: attempt?.submitted_at ?? null,
    attemptStatus: attempt?.status ?? null,
    attemptEndsAt: attempt?.ends_at ?? null,
    mcqBreakdown: row.mcq_breakdown ?? undefined,
    codingBreakdown: row.coding_breakdown ?? undefined
  };
}

function attemptKey(userId: string, examId: string): string {
  return `${userId}:${examId}`;
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

  async listAllRegistrations(params: Omit<RegistrationListParams, 'page' | 'pageSize'>): Promise<ExamRegistration[]> {
    const pageSize = 1000;
    const all: ExamRegistration[] = [];
    let page = 1;

    while (true) {
      const chunk = await this.listRegistrations({ ...params, page, pageSize });
      all.push(...chunk.rows);
      if (chunk.rows.length < pageSize || all.length >= chunk.total) break;
      page += 1;
    }

    return all;
  }

  private async loadAttemptKeys(): Promise<Set<string>> {
    const keys = new Set<string>();
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('exam_attempts')
        .select('user_id, exam_id')
        .range(from, from + pageSize - 1);

      if (error) throw new Error(error.message);
      if (!data?.length) break;

      for (const row of data) {
        if (row.user_id && row.exam_id) {
          keys.add(attemptKey(String(row.user_id), String(row.exam_id)));
        }
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }

    return keys;
  }

  async listNotAttended(filters?: { roleSlug?: string; examId?: string }): Promise<ExamNotAttendedRow[]> {
    const attemptKeys = await this.loadAttemptKeys();
    const pageSize = 1000;
    let from = 0;
    const rows: ExamNotAttendedRow[] = [];

    while (true) {
      let query = supabase
        .from('exam_registrations')
        .select('id, email, full_name, role_interested, role_slug, exam_id, user_id, credentials_sent_at, created_at, exams(title)')
        .not('user_id', 'is', null)
        .not('exam_id', 'is', null)
        .order('created_at', { ascending: false });

      if (filters?.roleSlug) query = query.eq('role_slug', filters.roleSlug);
      if (filters?.examId) query = query.eq('exam_id', filters.examId);

      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;

      for (const raw of data as RegistrationRow[]) {
        const userId = raw.user_id;
        const examId = raw.exam_id;
        if (!userId || !examId) continue;
        if (attemptKeys.has(attemptKey(userId, examId))) continue;

        const mapped = mapRegistration(raw);
        rows.push({
          id: mapped.id,
          email: mapped.email,
          fullName: mapped.fullName,
          roleInterested: mapped.roleInterested,
          roleSlug: mapped.roleSlug,
          examId: mapped.examId,
          examTitle: mapped.examTitle,
          credentialsSentAt: mapped.credentialsSentAt,
          createdAt: mapped.createdAt
        });
      }

      if (data.length < pageSize) break;
      from += pageSize;
    }

    return rows;
  }

  async getPortalStats(filters?: { roleSlug?: string; examId?: string }): Promise<ExamPortalStats> {
    const { data, error } = await supabase.rpc('admin_exam_portal_stats', {
      p_role_slug: filters?.roleSlug ?? null,
      p_exam_id: filters?.examId ?? null
    });

    if (error) throw new Error(error.message);

    const payload = (data ?? {}) as Record<string, number>;
    return {
      registrations: Number(payload['registrations'] ?? 0),
      submitted: Number(payload['submitted'] ?? 0),
      notStarted: Number(payload['notStarted'] ?? 0),
      inProgress: Number(payload['inProgress'] ?? 0),
      notProvisioned: Number(payload['notProvisioned'] ?? 0)
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

  async countPendingCredentials(params?: { examId?: string }): Promise<number> {
    let query = supabase
      .from('exam_registrations')
      .select('*', { count: 'exact', head: true })
      .is('credentials_sent_at', null)
      .not('user_id', 'is', null);

    if (params?.examId) query = query.eq('exam_id', params.examId);

    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async listPendingRegistrationIds(params?: { examId?: string }): Promise<string[]> {
    const pageSize = 1000;
    const ids: string[] = [];
    let from = 0;

    while (true) {
      let query = supabase
        .from('exam_registrations')
        .select('id')
        .is('credentials_sent_at', null)
        .not('user_id', 'is', null)
        .order('created_at', { ascending: true });

      if (params?.examId) query = query.eq('exam_id', params.examId);

      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;

      for (const row of data) {
        ids.push(String(row.id));
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }

    return ids;
  }

  async addSingleRegistration(input: {
    email: string;
    fullName: string;
    roleInterested: string;
    sendCredentials?: boolean;
  }): Promise<{ registrationId?: string; message: string }> {
    const roleDef = EXAM_ROLE_DEFINITIONS.find((r) => r.name === input.roleInterested.trim());
    const batchId = crypto.randomUUID();
    const importResult = await this.importFromExcel(
      [
        {
          email: input.email.trim().toLowerCase(),
          fullName: input.fullName.trim(),
          roleInterested: input.roleInterested.trim()
        }
      ],
      batchId
    );

    if (importResult.summary.failed > 0) {
      throw new Error('Could not register student (check email and role)');
    }

    const roleSlug = roleDef?.slug ?? input.roleInterested.trim().toLowerCase();

    const { data: row, error } = await supabase
      .from('exam_registrations')
      .select('id')
      .eq('email', input.email.trim().toLowerCase())
      .eq('role_slug', roleSlug)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const registrationId = row?.id ? String(row.id) : undefined;

    if (input.sendCredentials !== false && registrationId) {
      await this.sendCredentials({ registrationIds: [registrationId], onlyUnsent: true });
    }

    return {
      registrationId,
      message: importResult.summary.success ? 'Student registered' : 'Registration failed'
    };
  }

  async sendCredentials(options: {
    registrationIds?: string[];
    examId?: string;
    onlyUnsent?: boolean;
  }): Promise<SendCredentialsResult> {
    const { data, error } = await invokeAuthedFunction<SendCredentialsResult & { error?: string }>(
      'send-exam-credentials',
      options
    );

    if (data && typeof data.error === 'string' && data.error) {
      throw new Error(data.error);
    }

    if (error) {
      const ctx = error as { context?: Response; message?: string };
      if (ctx.context && typeof ctx.context.json === 'function') {
        try {
          const payload = (await ctx.context.json()) as { error?: string };
          if (payload?.error) throw new Error(payload.error);
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== 'Send failed') throw parseErr;
        }
      }
      throw new Error(error instanceof Error ? error.message : 'Send failed');
    }

    if (!data?.summary) throw new Error('Send failed');
    return data;
  }

  async resetAndSendCredentials(registrationId: string): Promise<SendCredentialsRowResult> {
    const result = await this.sendCredentials({
      registrationIds: [registrationId],
      onlyUnsent: false
    });
    const row = result.results.find((item) => item.registrationId === registrationId);
    if (!row) throw new Error('Registration not found');
    if (!row.success) throw new Error(row.message);
    return row;
  }

  async listResults(examId?: string, roleSlug?: string): Promise<ExamResultRow[]> {
    let query = supabase
      .from('exam_results')
      .select(
        '*, exam_attempts ( started_at, submitted_at, status, ends_at )'
      )
      .order('evaluated_at', { ascending: false });
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

  async getResultDetail(resultId: string): Promise<ExamResultDetail> {
    const { data: resultRow, error: resultErr } = await supabase
      .from('exam_results')
      .select('*')
      .eq('id', resultId)
      .single();

    if (resultErr || !resultRow) throw new Error(resultErr?.message ?? 'Result not found');

    const result = mapResult(resultRow as ResultRow);

    const { data: attempt, error: attemptErr } = await supabase
      .from('exam_attempts')
      .select('exam_role_id')
      .eq('id', result.attemptId)
      .single();

    if (attemptErr || !attempt) throw new Error(attemptErr?.message ?? 'Attempt not found');

    const [{ data: questions, error: questionsErr }, { data: answers, error: answersErr }] =
      await Promise.all([
        supabase
          .from('exam_questions')
          .select('*')
          .eq('exam_role_id', attempt.exam_role_id)
          .order('sort_order', { ascending: true }),
        supabase.from('exam_answers').select('*').eq('attempt_id', result.attemptId)
      ]);

    if (questionsErr) throw new Error(questionsErr.message);
    if (answersErr) throw new Error(answersErr.message);

    const answerByQuestion = new Map<string, Record<string, unknown>>();
    for (const row of (answers ?? []) as ExamAnswerRow[]) {
      answerByQuestion.set(row.question_id, row.answer);
    }

    const mcqByQuestion = new Map(
      (result.mcqBreakdown ?? []).map((item) => [item.questionId, item] as const)
    );
    const codingByQuestion = new Map(
      (result.codingBreakdown ?? []).map((item) => [item.questionId, item] as const)
    );

    const reviews: ExamResultQuestionReview[] = ((questions ?? []) as ExamQuestionRow[]).map(
      (row) => {
        const question = mapQuestion(row);
        return {
          question,
          answer: answerByQuestion.get(question.id) ?? null,
          mcqBreakdown: mcqByQuestion.get(question.id),
          codingBreakdown: codingByQuestion.get(question.id)
        };
      }
    );

    return { result, questions: reviews };
  }
}
