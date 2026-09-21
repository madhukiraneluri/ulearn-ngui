import { Injectable, inject } from '@angular/core';
import { supabase, invokeAuthedFunction } from '../../core/supabase.client';
import type {
  Exam,
  ExamCandidateImportRow,
  ExamQuestion,
  ExamQuestionImportInput,
  ExamMcqPayload,
  ExamCodingPayload,
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

export interface ImportCandidateResult {
  rowNumber: number;
  email: string;
  success: boolean;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AdminExamsService {
  async listExams(): Promise<Exam[]> {
    const { data, error } = await supabase
      .from('exams')
      .select('*')
      .order('starts_at', { ascending: false });

    if (error) throw new Error(error.message);
    return ((data ?? []) as ExamRow[]).map(mapExam);
  }

  async createExam(input: ExamUpsertInput): Promise<Exam> {
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('exams')
      .insert({
        title: input.title.trim(),
        description: input.description?.trim() || null,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        duration_minutes: input.durationMinutes,
        max_concurrent: input.maxConcurrent ?? 1000,
        status: input.status ?? 'draft',
        created_by: userData.user?.id ?? null
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return mapExam(data as ExamRow);
  }

  async updateExamStatus(examId: string, status: Exam['status']): Promise<void> {
    const { error } = await supabase
      .from('exams')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', examId);

    if (error) throw new Error(error.message);
  }

  async listRoles(examId: string): Promise<ExamRole[]> {
    const { data, error } = await supabase
      .from('exam_roles')
      .select('*')
      .eq('exam_id', examId)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(error.message);
    return ((data ?? []) as ExamRoleRow[]).map(mapRole);
  }

  async upsertRole(
    examId: string,
    role: { name: string; slug: string; hasCoding: boolean; sortOrder: number }
  ): Promise<ExamRole> {
    const { data, error } = await supabase
      .from('exam_roles')
      .upsert(
        {
          exam_id: examId,
          name: role.name.trim(),
          slug: role.slug.trim().toLowerCase(),
          has_coding: role.hasCoding,
          sort_order: role.sortOrder
        },
        { onConflict: 'exam_id,slug' }
      )
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return mapRole(data as ExamRoleRow);
  }

  async importCandidates(
    examId: string,
    candidates: ExamCandidateImportRow[],
    sendEmail = true
  ): Promise<{ results: ImportCandidateResult[]; summary: { total: number; success: number; failed: number } }> {
    const { data, error } = await invokeAuthedFunction<{
      results: ImportCandidateResult[];
      summary: { total: number; success: number; failed: number };
    }>('create-exam-candidate', {
      examId,
      candidates,
      sendEmail
    });

    if (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      throw new Error(message);
    }

    if (!data) throw new Error('No response from import service');
    return data;
  }

  async listQuestions(examRoleId: string): Promise<ExamQuestion[]> {
    const { data, error } = await supabase
      .from('exam_questions')
      .select('*')
      .eq('exam_role_id', examRoleId)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(error.message);
    return ((data ?? []) as ExamQuestionRow[]).map(mapQuestion);
  }

  async importQuestions(examRoleId: string, items: ExamQuestionImportInput[]): Promise<number> {
    if (items.length === 0) throw new Error('No questions to import');

    const rows = items.map((item, index) => ({
      exam_role_id: examRoleId,
      type: item.type,
      sort_order: item.sortOrder ?? index,
      payload: item.payload
    }));

    const { error } = await supabase.from('exam_questions').insert(rows);
    if (error) throw new Error(error.message);
    return rows.length;
  }

  async updateQuestionOrder(questionId: string, sortOrder: number): Promise<void> {
    const { error } = await supabase
      .from('exam_questions')
      .update({ sort_order: sortOrder })
      .eq('id', questionId);

    if (error) throw new Error(error.message);
  }

  async deleteQuestion(questionId: string): Promise<void> {
    const { error } = await supabase.from('exam_questions').delete().eq('id', questionId);
    if (error) throw new Error(error.message);
  }
}

interface ExamQuestionRow {
  id: string;
  exam_role_id: string;
  type: ExamQuestion['type'];
  sort_order: number;
  payload: ExamMcqPayload | ExamCodingPayload;
  created_at: string;
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
