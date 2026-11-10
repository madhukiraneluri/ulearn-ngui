import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export interface CrtCompanyPack {
  id: string;
  name: string;
  description: string | null;
  status: 'published';
  created_at: string;
  updated_at: string;
}

export interface CrtCompanyPackAttempt {
  id: string;
  pack_id: string;
  status: 'in_progress' | 'submitted';
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number | null;
}

export interface CrtCompanyPackQuestion {
  question_id: string;
  stem: string;
  options: [string, string, string, string];
  topic: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  sort_order: number;
}

export interface CrtCompanyPackAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_index: 0 | 1 | 2 | 3 | null;
  answered_at: string;
}

export interface CrtCompanyPackGradedAnswer extends CrtCompanyPackAnswer {
  is_correct: boolean | null;
}

export interface CrtCompanyPackScore {
  attempt_score: number;
  attempt_max_score: number;
}

export interface CrtCompanyPackHistoryAttempt {
  id: string;
  pack_id: string;
  pack_name: string | null;
  submitted_at: string | null;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
}

const PACK_COLUMNS = 'id, name, description, status, created_at, updated_at';
const ATTEMPT_COLUMNS =
  'id, pack_id, status, started_at, submitted_at, score, max_score';
const ANSWER_COLUMNS = 'id, attempt_id, question_id, selected_index, answered_at';
const GRADED_ANSWER_COLUMNS = `${ANSWER_COLUMNS}, is_correct`;

@Injectable({ providedIn: 'root' })
export class CrtCompanyPackService {
  async listPublishedPacks(): Promise<CrtCompanyPack[]> {
    const { data, error } = await supabase
      .from('crt_company_packs')
      .select(PACK_COLUMNS)
      .eq('status', 'published')
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.toPublishedPack(row));
  }

  async listInProgressAttempts(packId?: string): Promise<CrtCompanyPackAttempt[]> {
    const userId = await this.requireUserId();
    let query = supabase
      .from('crt_company_pack_attempts')
      .select(ATTEMPT_COLUMNS)
      .eq('user_id', userId)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false });

    if (packId) query = query.eq('pack_id', packId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.toAttempt(row, 'in_progress'));
  }

  async listSubmittedHistory(): Promise<CrtCompanyPackHistoryAttempt[]> {
    const userId = await this.requireUserId();
    const { data, error } = await supabase
      .from('crt_company_pack_attempts')
      .select(ATTEMPT_COLUMNS)
      .eq('user_id', userId)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false });

    if (error) throw new Error(error.message);
    const attempts = (data ?? []).map((row) => this.toAttempt(row, 'submitted'));
    if (attempts.length === 0) return [];

    const packIds = [...new Set(attempts.map((attempt) => attempt.pack_id))];
    const { data: packs, error: packError } = await supabase
      .from('crt_company_packs')
      .select('id, name')
      .in('id', packIds);

    if (packError) throw new Error(packError.message);
    const packNames = new Map<string, string>();
    for (const pack of packs ?? []) {
      if (typeof pack.id === 'string' && typeof pack.name === 'string' && pack.name.trim()) {
        packNames.set(pack.id, pack.name);
      }
    }

    return attempts.map((attempt) => ({
      id: attempt.id,
      pack_id: attempt.pack_id,
      pack_name: packNames.get(attempt.pack_id) ?? null,
      submitted_at: attempt.submitted_at,
      score: attempt.score,
      max_score: attempt.max_score,
      percentage: historyPercentage(attempt.score, attempt.max_score),
    }));
  }

  async startAttempt(packId: string): Promise<string> {
    const { data, error } = await supabase.rpc('crt_start_company_pack_attempt', {
      target_pack: packId,
    });

    if (error) throw new Error(error.message);
    if (typeof data !== 'string' || data.trim() === '') {
      throw new Error('Company pack attempt was not created.');
    }
    return data;
  }

  async getQuestions(attemptId: string): Promise<CrtCompanyPackQuestion[]> {
    const { data, error } = await supabase.rpc('crt_get_company_pack_questions', {
      target_attempt: attemptId,
    });

    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []).map((row) => this.toQuestion(row));
  }

  async listSelectedAnswers(attemptId: string): Promise<CrtCompanyPackAnswer[]> {
    await this.requireOwnedAttempt(attemptId, 'in_progress');

    const { data, error } = await supabase
      .from('crt_company_pack_attempt_answers')
      .select(ANSWER_COLUMNS)
      .eq('attempt_id', attemptId)
      .order('answered_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.toAnswer(row));
  }

  async saveAnswer(
    attemptId: string,
    questionId: string,
    selectedIndex: 0 | 1 | 2 | 3,
  ): Promise<CrtCompanyPackAnswer> {
    await this.requireOwnedAttempt(attemptId, 'in_progress');
    await this.requireSnapshotQuestion(attemptId, questionId);

    const answeredAt = new Date().toISOString();
    const { data: current, error: lookupError } = await supabase
      .from('crt_company_pack_attempt_answers')
      .select('id')
      .eq('attempt_id', attemptId)
      .eq('question_id', questionId)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);

    if (current) {
      const { data, error } = await supabase
        .from('crt_company_pack_attempt_answers')
        .update({
          selected_index: selectedIndex,
          answered_at: answeredAt,
        })
        .eq('id', current.id)
        .select(ANSWER_COLUMNS)
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error('Selected answer was not saved.');
      return this.toAnswer(data);
    }

    const { data, error } = await supabase
      .from('crt_company_pack_attempt_answers')
      .insert({
        attempt_id: attemptId,
        question_id: questionId,
        selected_index: selectedIndex,
        answered_at: answeredAt,
      })
      .select(ANSWER_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Selected answer was not saved.');
    return this.toAnswer(data);
  }

  async submitAttempt(attemptId: string): Promise<CrtCompanyPackScore> {
    await this.requireOwnedAttempt(attemptId, 'in_progress');

    const { data, error } = await supabase.rpc('crt_submit_company_pack_attempt', {
      target_attempt: attemptId,
    });

    if (error) throw new Error(error.message);
    const row = this.firstRow(data);
    if (!row) throw new Error('The database did not return an attempt score.');

    return {
      attempt_score: this.databaseNumber(row['attempt_score'], 'attempt_score'),
      attempt_max_score: this.databaseNumber(row['attempt_max_score'], 'attempt_max_score'),
    };
  }

  async getSubmittedAttempt(attemptId: string): Promise<CrtCompanyPackAttempt> {
    return this.requireOwnedAttempt(attemptId, 'submitted');
  }

  async listSubmittedAnswers(attemptId: string): Promise<CrtCompanyPackGradedAnswer[]> {
    await this.requireOwnedAttempt(attemptId, 'submitted');

    const { data, error } = await supabase
      .from('crt_company_pack_attempt_answers')
      .select(GRADED_ANSWER_COLUMNS)
      .eq('attempt_id', attemptId)
      .order('answered_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.toGradedAnswer(row));
  }

  private async requireUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Not signed in.');
    return data.user.id;
  }

  private async requireOwnedAttempt(
    attemptId: string,
    expectedStatus: CrtCompanyPackAttempt['status'],
  ): Promise<CrtCompanyPackAttempt> {
    const userId = await this.requireUserId();
    const { data, error } = await supabase
      .from('crt_company_pack_attempts')
      .select(ATTEMPT_COLUMNS)
      .eq('id', attemptId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Company pack attempt not found.');

    const attempt = this.toAttempt(data);
    if (attempt.status !== expectedStatus) {
      throw new Error(
        expectedStatus === 'submitted'
          ? 'This company pack attempt has not been submitted.'
          : 'This company pack attempt has already been submitted.',
      );
    }
    return attempt;
  }

  private async requireSnapshotQuestion(attemptId: string, questionId: string): Promise<void> {
    const { data, error } = await supabase
      .from('crt_company_pack_attempt_questions')
      .select('question_id')
      .eq('attempt_id', attemptId)
      .eq('question_id', questionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Question is not part of this company pack attempt.');
  }

  private toPublishedPack(row: unknown): CrtCompanyPack {
    const record = this.record(row);
    if (record['status'] !== 'published') {
      throw new Error('Company pack is not published.');
    }
    return {
      id: this.text(record['id'], 'pack id'),
      name: this.text(record['name'], 'pack name'),
      description: this.nullableText(record['description']),
      status: 'published',
      created_at: this.text(record['created_at'], 'created_at'),
      updated_at: this.text(record['updated_at'], 'updated_at'),
    };
  }

  private toAttempt(
    row: unknown,
    expectedStatus?: CrtCompanyPackAttempt['status'],
  ): CrtCompanyPackAttempt {
    const record = this.record(row);
    const status = record['status'];
    if (status !== 'in_progress' && status !== 'submitted') {
      throw new Error('Company pack attempt status is not recognized.');
    }
    if (expectedStatus && status !== expectedStatus) {
      throw new Error('Company pack attempt status is not recognized.');
    }
    const score = record['score'];
    const maxScore = record['max_score'];
    return {
      id: this.text(record['id'], 'attempt id'),
      pack_id: this.text(record['pack_id'], 'pack id'),
      status,
      started_at: this.text(record['started_at'], 'started_at'),
      submitted_at: this.nullableText(record['submitted_at']),
      score: score === null ? null : this.databaseNumber(score, 'score'),
      max_score: maxScore === null ? null : this.databaseNumber(maxScore, 'max_score'),
    };
  }

  private toQuestion(row: unknown): CrtCompanyPackQuestion {
    const record = this.record(row);
    const difficulty = record['difficulty'];
    return {
      question_id: this.text(record['question_id'], 'question id'),
      stem: this.text(record['stem'], 'question stem'),
      options: this.options(record['options']),
      topic: this.nullableText(record['topic']),
      difficulty:
        difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard'
          ? difficulty
          : null,
      sort_order: this.databaseNumber(record['sort_order'], 'sort_order'),
    };
  }

  private toAnswer(row: unknown): CrtCompanyPackAnswer {
    const record = this.record(row);
    return {
      id: this.text(record['id'], 'answer id'),
      attempt_id: this.text(record['attempt_id'], 'attempt id'),
      question_id: this.text(record['question_id'], 'question id'),
      selected_index: this.selectedIndex(record['selected_index']),
      answered_at: this.text(record['answered_at'], 'answered_at'),
    };
  }

  private toGradedAnswer(row: unknown): CrtCompanyPackGradedAnswer {
    const record = this.record(row);
    const isCorrect = record['is_correct'];
    return {
      ...this.toAnswer(row),
      is_correct: isCorrect === null ? null : isCorrect === true,
    };
  }

  private options(value: unknown): [string, string, string, string] {
    if (
      !Array.isArray(value) ||
      value.length !== 4 ||
      value.some((option) => typeof option !== 'string' || option.trim() === '')
    ) {
      throw new Error('Question options are incomplete.');
    }
    return [value[0], value[1], value[2], value[3]];
  }

  private selectedIndex(value: unknown): 0 | 1 | 2 | 3 | null {
    if (value === null || value === undefined) return null;
    const index = typeof value === 'number' ? value : Number(value);
    if (index === 0 || index === 1 || index === 2 || index === 3) return index;
    throw new Error('Selected answer is outside the allowed options.');
  }

  private databaseNumber(value: unknown, label: string): number {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (!Number.isFinite(parsed)) throw new Error(`Database did not return ${label}.`);
    return parsed;
  }

  private firstRow(data: unknown): Record<string, unknown> | null {
    if (Array.isArray(data)) {
      return data.length > 0 ? this.record(data[0]) : null;
    }
    if (data && typeof data === 'object') return this.record(data);
    return null;
  }

  private record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Database returned an unexpected record.');
    }
    return value as Record<string, unknown>;
  }

  private text(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Database did not return ${label}.`);
    }
    return value;
  }

  private nullableText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  }
}

function historyPercentage(score: number | null, maxScore: number | null): number | null {
  if (score === null || maxScore === null || maxScore <= 0) return null;
  return Math.round((score / maxScore) * 100);
}
