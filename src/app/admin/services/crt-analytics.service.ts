import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export interface CrtAnalyticsWeakQuestion {
  questionId: string;
  stem: string;
  topic: string | null;
  answerCount: number;
  wrongAnswerRate: number;
}

export interface CrtAnalyticsDashboard {
  practiceStarted: number;
  practiceSubmitted: number;
  mocksSubmitted: number;
  studentsAtOrAboveThreshold: number;
  weakQuestions: CrtAnalyticsWeakQuestion[];
}

@Injectable({ providedIn: 'root' })
export class CrtAnalyticsService {
  async load(readinessThreshold: number): Promise<CrtAnalyticsDashboard> {
    if (!Number.isFinite(readinessThreshold) || readinessThreshold < 0 || readinessThreshold > 100) {
      throw new Error('Readiness threshold must be between 0 and 100.');
    }

    const { data, error } = await supabase.rpc('crt_analytics_dashboard', {
      p_readiness_threshold: readinessThreshold,
    });

    if (error) throw new Error(analyticsErrorMessage(error.message));
    return parseDashboard(data);
  }
}

export function analyticsErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('forbidden') || text.includes('42501')) {
    return 'You do not have access to CRT analytics.';
  }
  if (text.includes('unauthenticated') || text.includes('28000')) {
    return 'Sign in again to view CRT analytics.';
  }
  if (text.includes('invalid readiness_threshold')) {
    return 'Readiness threshold must be between 0 and 100.';
  }
  if (text.includes('crt_analytics_dashboard') && text.includes('could not find')) {
    return 'CRT analytics is not available yet.';
  }
  return message || 'Could not load CRT analytics.';
}

function parseDashboard(value: unknown): CrtAnalyticsDashboard {
  const record = asRecord(value);
  if (!record) throw new Error('CRT analytics returned an unexpected response.');

  const weakQuestions = valueList(record['weakQuestions']);
  if (!weakQuestions) throw new Error('CRT analytics returned an unexpected response.');

  return {
    practiceStarted: requiredCount(record['practiceStarted'], 'practiceStarted'),
    practiceSubmitted: requiredCount(record['practiceSubmitted'], 'practiceSubmitted'),
    mocksSubmitted: requiredCount(record['mocksSubmitted'], 'mocksSubmitted'),
    studentsAtOrAboveThreshold: requiredCount(
      record['studentsAtOrAboveThreshold'],
      'studentsAtOrAboveThreshold',
    ),
    weakQuestions: weakQuestions.map(parseWeakQuestion),
  };
}

function parseWeakQuestion(value: unknown): CrtAnalyticsWeakQuestion {
  const record = asRecord(value);
  const questionId = requiredText(record?.['questionId']);
  const stem = requiredText(record?.['stem']);
  if (!record || !questionId || stem === null) {
    throw new Error('CRT analytics returned an unexpected question.');
  }

  const topicValue = record['topic'];
  const topic = topicValue === null ? null : requiredText(topicValue);
  if (topicValue !== null && topic === null) {
    throw new Error('CRT analytics returned an unexpected question.');
  }

  return {
    questionId,
    stem,
    topic,
    answerCount: requiredCount(record['answerCount'], 'answerCount'),
    wrongAnswerRate: requiredRate(record['wrongAnswerRate']),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function valueList(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function requiredCount(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error(`CRT analytics returned an invalid ${field}.`);
  }
  return parsed;
}

function requiredRate(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error('CRT analytics returned an invalid wrongAnswerRate.');
  }
  return parsed;
}
