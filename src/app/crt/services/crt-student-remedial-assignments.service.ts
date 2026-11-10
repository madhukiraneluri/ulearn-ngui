import { Injectable, signal } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export interface CrtStudentRemedialAssignment {
  assignmentId: string;
  moduleId: string;
  moduleTitle: string;
  pathId: string;
  pathTitle: string;
  dueAt: string | null;
  assignedAt: string;
}

@Injectable({ providedIn: 'root' })
export class CrtStudentRemedialAssignmentsService {
  private readonly _openAssignmentsRefresh = signal(0);

  /** Bumped after practice submit so CRT home can reload open assignments. */
  readonly openAssignmentsRefresh = this._openAssignmentsRefresh.asReadonly();

  invalidateOpenAssignments(): void {
    this._openAssignmentsRefresh.update((value) => value + 1);
  }

  async listOpenForStudent(): Promise<CrtStudentRemedialAssignment[]> {
    const { data, error } = await supabase.rpc('crt_remedial_list_open_for_student');
    if (error) throw new Error(remedialListErrorMessage(error.message));
    return parseOpenAssignments(data);
  }
}

export function remedialListErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('crt access required') || text.includes('42501')) {
    return 'You do not have access to remedial assignments.';
  }
  if (text.includes('unauthenticated') || text.includes('28000')) {
    return 'Sign in again to view remedial assignments.';
  }
  return message || 'Could not load remedial assignments.';
}

function parseOpenAssignments(value: unknown): CrtStudentRemedialAssignment[] {
  const record = asRecord(value);
  const items = objectList(record['assignments']);
  return items.flatMap((item) => {
    const assignmentId = text(item['assignmentId']);
    const moduleId = text(item['moduleId']);
    const moduleTitle = text(item['moduleTitle']);
    const pathId = text(item['pathId']);
    const pathTitle = text(item['pathTitle']);
    const assignedAt = text(item['assignedAt']);
    if (!assignmentId || !moduleId || !moduleTitle || !pathId || !pathTitle || !assignedAt) {
      return [];
    }
    return [
      {
        assignmentId,
        moduleId,
        moduleTitle,
        pathId,
        pathTitle,
        dueAt: text(item['dueAt']),
        assignedAt,
      },
    ];
  });
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
