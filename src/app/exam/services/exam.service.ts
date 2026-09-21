import { Injectable } from '@angular/core';
import { supabase, invokeAuthedFunction } from '../../core/supabase.client';
import type {
  Exam,
  ExamAttempt,
  ExamCandidate,
  ExamCodingPayload,
  ExamMcqPayload,
  ExamQuestion,
  ExamRole,
  ExamUpsertInput
} from '../../models/index';

interface ExamRow {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  max_concurrent: number;
  status: Exam['status'];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ExamRoleRow {
  id: string;
  exam_id: string;
  name: string;
  slug: string;
  has_coding: boolean;
  sort_order: number;
  created_at: string;
}

interface ExamCandidateRow {
  id: string;
  exam_id: string;
  user_id: string;
  exam_role_id: string;
  registered_at: string;
  credentials_sent_at: string | null;
  exams?: ExamRow | ExamRow[] | null;
  exam_roles?: ExamRoleRow | ExamRoleRow[] | null;
}

interface ExamQuestionRow {
  id: string;
  exam_role_id: string;
  type: ExamQuestion['type'];
  sort_order: number;
  payload: ExamMcqPayload | ExamCodingPayload;
  created_at: string;
}

interface ExamAttemptRow {
  id: string;
  exam_id: string;
  exam_role_id: string;
  user_id: string;
  started_at: string;
  ends_at: string;
  submitted_at: string | null;
  status: ExamAttempt['status'];
  fullscreen_exit_count: number;
  proctoring_consent_at: string | null;
  created_at: string;
}

export interface StartExamResult {
  attemptId: string;
  endsAt: string;
}

function mapExam(row: ExamRow): Exam {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    durationMinutes: row.duration_minutes,
    maxConcurrent: row.max_concurrent,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRole(row: ExamRoleRow): ExamRole {
  return {
    id: row.id,
    examId: row.exam_id,
    name: row.name,
    slug: row.slug,
    hasCoding: row.has_coding,
    sortOrder: row.sort_order,
    createdAt: row.created_at
  };
}

function mapAttempt(row: ExamAttemptRow): ExamAttempt {
  return {
    id: row.id,
    examId: row.exam_id,
    examRoleId: row.exam_role_id,
    userId: row.user_id,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    submittedAt: row.submitted_at,
    status: row.status,
    fullscreenExitCount: row.fullscreen_exit_count,
    proctoringConsentAt: row.proctoring_consent_at,
    createdAt: row.created_at
  };
}

function mapQuestion(row: ExamQuestionRow, stripAnswers = false): ExamQuestion {
  let payload = row.payload;
  if (stripAnswers && row.type === 'mcq') {
    const mcq = { ...(payload as ExamMcqPayload) };
    delete (mcq as Partial<ExamMcqPayload>).correctIndex;
    payload = mcq;
  }
  return {
    id: row.id,
    examRoleId: row.exam_role_id,
    type: row.type,
    sortOrder: row.sort_order,
    payload,
    createdAt: row.created_at
  };
}

function first<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

@Injectable({ providedIn: 'root' })
export class ExamService {
  async listMyExams(userId: string): Promise<ExamCandidate[]> {
    const { data, error } = await supabase
      .from('exam_candidates')
      .select(`
        id, exam_id, user_id, exam_role_id, registered_at, credentials_sent_at,
        exams ( id, title, description, starts_at, ends_at, duration_minutes, max_concurrent, status, created_by, created_at, updated_at ),
        exam_roles ( id, exam_id, name, slug, has_coding, sort_order, created_at )
      `)
      .eq('user_id', userId)
      .order('registered_at', { ascending: false });

    if (error) throw new Error(error.message);

    return ((data ?? []) as ExamCandidateRow[]).map((row) => ({
      id: row.id,
      examId: row.exam_id,
      userId: row.user_id,
      examRoleId: row.exam_role_id,
      registeredAt: row.registered_at,
      credentialsSentAt: row.credentials_sent_at,
      exam: first(row.exams) ? mapExam(first(row.exams)!) : undefined,
      role: first(row.exam_roles) ? mapRole(first(row.exam_roles)!) : undefined
    }));
  }

  async getExam(examId: string): Promise<Exam | null> {
    const { data, error } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapExam(data as ExamRow) : null;
  }

  async getMyAssignment(userId: string, examId: string): Promise<ExamCandidate | null> {
    const { data, error } = await supabase
      .from('exam_candidates')
      .select(`
        id, exam_id, user_id, exam_role_id, registered_at, credentials_sent_at,
        exams ( id, title, description, starts_at, ends_at, duration_minutes, max_concurrent, status, created_by, created_at, updated_at ),
        exam_roles ( id, exam_id, name, slug, has_coding, sort_order, created_at )
      `)
      .eq('user_id', userId)
      .eq('exam_id', examId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const row = data as ExamCandidateRow;
    return {
      id: row.id,
      examId: row.exam_id,
      userId: row.user_id,
      examRoleId: row.exam_role_id,
      registeredAt: row.registered_at,
      credentialsSentAt: row.credentials_sent_at,
      exam: first(row.exams) ? mapExam(first(row.exams)!) : undefined,
      role: first(row.exam_roles) ? mapRole(first(row.exam_roles)!) : undefined
    };
  }

  async getActiveAttempt(userId: string, examId: string): Promise<ExamAttempt | null> {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select('*')
      .eq('user_id', userId)
      .eq('exam_id', examId)
      .eq('status', 'in_progress')
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapAttempt(data as ExamAttemptRow) : null;
  }

  /** Latest attempt per exam for this user (for dashboard status). */
  async listLatestAttemptsByExam(userId: string): Promise<Record<string, ExamAttempt>> {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const map: Record<string, ExamAttempt> = {};
    for (const row of (data ?? []) as ExamAttemptRow[]) {
      if (!map[row.exam_id]) {
        map[row.exam_id] = mapAttempt(row);
      }
    }
    return map;
  }

  async startExam(examId: string): Promise<StartExamResult> {
    const { data, error } = await invokeAuthedFunction<StartExamResult>('exam-start-slot', { examId });

    if (error) {
      const message = error instanceof Error ? error.message : 'Could not start exam';
      throw new Error(message);
    }
    if (!data?.attemptId) throw new Error('Could not start exam');
    return data;
  }

  async getAttempt(attemptId: string): Promise<ExamAttempt | null> {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select('*')
      .eq('id', attemptId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapAttempt(data as ExamAttemptRow) : null;
  }

  async getQuestionsForRole(examRoleId: string): Promise<ExamQuestion[]> {
    const { data, error } = await supabase
      .from('exam_questions')
      .select('*')
      .eq('exam_role_id', examRoleId)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(error.message);
    return ((data ?? []) as ExamQuestionRow[]).map((row) => mapQuestion(row, true));
  }

  async saveAnswer(attemptId: string, questionId: string, answer: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from('exam_answers').upsert(
      {
        attempt_id: attemptId,
        question_id: questionId,
        answer,
        answered_at: new Date().toISOString()
      },
      { onConflict: 'attempt_id,question_id' }
    );

    if (error) throw new Error(error.message);
  }

  async loadAnswers(attemptId: string): Promise<Record<string, Record<string, unknown>>> {
    const { data, error } = await supabase
      .from('exam_answers')
      .select('question_id, answer')
      .eq('attempt_id', attemptId);

    if (error) throw new Error(error.message);

    const map: Record<string, Record<string, unknown>> = {};
    for (const row of data ?? []) {
      map[String(row.question_id)] = row.answer as Record<string, unknown>;
    }
    return map;
  }

  async incrementFullscreenExit(attemptId: string): Promise<number> {
    const attempt = await this.getAttempt(attemptId);
    if (!attempt) throw new Error('Attempt not found');

    const next = attempt.fullscreenExitCount + 1;
    const { error } = await supabase
      .from('exam_attempts')
      .update({ fullscreen_exit_count: next })
      .eq('id', attemptId);

    if (error) throw new Error(error.message);
    return next;
  }

  async recordProctoringConsent(attemptId: string): Promise<void> {
    const { error } = await supabase
      .from('exam_attempts')
      .update({ proctoring_consent_at: new Date().toISOString() })
      .eq('id', attemptId);

    if (error) throw new Error(error.message);
  }

  async submitAttempt(attemptId: string, autoSubmitted = false): Promise<void> {
    const { data, error } = await invokeAuthedFunction<{ ok: boolean }>('exam-submit', {
      attemptId,
      autoSubmitted
    });

    if (error) {
      const message = error instanceof Error ? error.message : 'Submit failed';
      throw new Error(message);
    }
    if (!data?.ok) throw new Error('Submit failed');
  }

  async uploadProctoringSnapshot(
    userId: string,
    attemptId: string,
    blob: Blob
  ): Promise<void> {
    const path = `${userId}/${attemptId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('exam-proctoring').upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false
    });

    if (error) throw new Error(error.message);
  }

  async runPublicTests(
    attemptId: string,
    questionId: string,
    code: string,
    language: string
  ): Promise<{
    results: Array<{
      input: string;
      expectedOutput: string;
      actualOutput: string;
      passed: boolean;
      stderr?: string;
      compileOutput?: string;
    }>;
    passedCount: number;
    total: number;
  }> {
    const { data, error } = await invokeAuthedFunction<{
      results: Array<{
        input: string;
        expectedOutput: string;
        actualOutput: string;
        passed: boolean;
        stderr?: string;
        compileOutput?: string;
      }>;
      passedCount: number;
      total: number;
    }>('exam-run-code', { attemptId, questionId, code, language });

    if (error) throw new Error(error instanceof Error ? error.message : 'Run failed');
    if (!data) throw new Error('Run failed');
    return data;
  }
}
