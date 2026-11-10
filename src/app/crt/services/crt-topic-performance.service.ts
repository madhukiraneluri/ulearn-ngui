import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export interface CrtTopicPerformance {
  topic: string;
  accuracy: number;
  answerCount: number;
}

interface GradedAnswer {
  questionId: string;
  isCorrect: boolean;
}

@Injectable({ providedIn: 'root' })
export class CrtTopicPerformanceService {
  async listTopicPerformance(pathId: string): Promise<CrtTopicPerformance[]> {
    const userId = await this.requireUserId();
    const [attemptIds, moduleIds, packAttemptIds] = await Promise.all([
      this.listSubmittedAttemptIds(userId, pathId),
      this.listModuleIds(pathId),
      this.listSubmittedPackAttemptIds(userId),
    ]);

    const [questions, answers, packAnswers] = await Promise.all([
      this.listPathQuestions(moduleIds),
      this.listGradedAnswers(attemptIds),
      this.listGradedPackAnswers(packAttemptIds),
    ]);
    const topicsByQuestionId = new Map(questions.map((question) => [question.id, question.topic]));
    return aggregateTopicPerformance([...answers, ...packAnswers], topicsByQuestionId);
  }

  private async listSubmittedAttemptIds(userId: string, pathId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('crt_attempts')
      .select('id, kind')
      .eq('user_id', userId)
      .eq('path_id', pathId)
      .eq('status', 'submitted');

    if (error) throw new Error(error.message);
    return (data ?? []).flatMap((row) => (
      (row.kind === 'practice' || row.kind === 'mock') && typeof row.id === 'string'
        ? [row.id]
        : []
    ));
  }

  private async listModuleIds(pathId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('crt_modules')
      .select('id')
      .eq('path_id', pathId);

    if (error) throw new Error(error.message);
    return (data ?? []).flatMap((row) => (typeof row.id === 'string' ? [row.id] : []));
  }

  private async listPathQuestions(moduleIds: readonly string[]): Promise<{ id: string; topic: string | null }[]> {
    if (moduleIds.length === 0) return [];

    const { data, error } = await supabase
      .from('crt_questions_student')
      .select('id, topic')
      .in('module_id', [...moduleIds]);

    if (error) throw new Error(error.message);
    return (data ?? []).flatMap((row) => (
      typeof row.id === 'string'
        ? [{ id: row.id, topic: typeof row.topic === 'string' ? row.topic : null }]
        : []
    ));
  }

  private async listGradedAnswers(attemptIds: readonly string[]): Promise<GradedAnswer[]> {
    if (attemptIds.length === 0) return [];

    const { data, error } = await supabase
      .from('crt_attempt_answers')
      .select('question_id, is_correct')
      .in('attempt_id', [...attemptIds])
      .not('is_correct', 'is', null);

    if (error) throw new Error(error.message);
    return (data ?? []).flatMap((row) => {
      if (typeof row.question_id !== 'string' || typeof row.is_correct !== 'boolean') return [];
      return [{ questionId: row.question_id, isCorrect: row.is_correct }];
    });
  }

  private async listSubmittedPackAttemptIds(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('crt_company_pack_attempts')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'submitted');

    if (error) throw new Error(error.message);
    return (data ?? []).flatMap((row) => (typeof row.id === 'string' ? [row.id] : []));
  }

  private async listGradedPackAnswers(attemptIds: readonly string[]): Promise<GradedAnswer[]> {
    if (attemptIds.length === 0) return [];

    const { data, error } = await supabase
      .from('crt_company_pack_attempt_answers')
      .select('question_id, is_correct')
      .in('attempt_id', [...attemptIds])
      .not('is_correct', 'is', null);

    if (error) throw new Error(error.message);
    return (data ?? []).flatMap((row) => {
      if (typeof row.question_id !== 'string' || typeof row.is_correct !== 'boolean') return [];
      return [{ questionId: row.question_id, isCorrect: row.is_correct }];
    });
  }

  private async requireUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Not signed in.');
    return data.user.id;
  }
}

export function aggregateTopicPerformance(
  answers: readonly GradedAnswer[],
  topicsByQuestionId: ReadonlyMap<string, string | null>,
): CrtTopicPerformance[] {
  const totals = new Map<string, { correct: number; count: number }>();

  for (const answer of answers) {
    const topic = topicName(topicsByQuestionId.get(answer.questionId) ?? null);
    if (!topic) continue;
    const current = totals.get(topic) ?? { correct: 0, count: 0 };
    current.count += 1;
    if (answer.isCorrect) current.correct += 1;
    totals.set(topic, current);
  }

  return [...totals.entries()]
    .map(([topic, total]) => ({
      topic,
      accuracy: clampPercent(Math.round((total.correct / total.count) * 100)),
      answerCount: total.count,
    }))
    .sort((left, right) => left.accuracy - right.accuracy || left.topic.localeCompare(right.topic));
}

function topicName(topic: string | null): string | null {
  const name = topic?.trim() ?? '';
  return name ? name : null;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
