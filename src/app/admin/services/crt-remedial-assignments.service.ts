import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export interface CrtRemedialAssignBulkResult {
  assigned: number;
  skipped: number;
}

export interface CrtRemedialAssignBulkInput {
  userIds: string[];
  moduleId: string;
  dueAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class CrtRemedialAssignmentsService {
  async assignBulk(input: CrtRemedialAssignBulkInput): Promise<CrtRemedialAssignBulkResult> {
    const { data, error } = await supabase.rpc('crt_remedial_assign_bulk', {
      p_user_ids: input.userIds,
      p_module_id: input.moduleId,
      p_due_at: input.dueAt,
    });
    if (error) throw new Error(remedialAssignErrorMessage(error.message));
    return parseBulkResult(data);
  }
}

export function remedialAssignErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('forbidden') || text.includes('42501')) {
    return 'You do not have permission to assign remedial modules.';
  }
  if (text.includes('unauthenticated') || text.includes('28000')) {
    return 'Sign in again to assign remedial modules.';
  }
  if (text.includes('module is not on a published learning path')) {
    return 'Choose a module on a published learning path.';
  }
  if (text.includes('module_id is required')) {
    return 'Choose a module to assign.';
  }
  if (text.includes('user_ids must be a non-empty array')) {
    return 'Select at least one student.';
  }
  return message || 'Could not assign remedial modules.';
}

function parseBulkResult(value: unknown): CrtRemedialAssignBulkResult {
  const record = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  return {
    assigned: count(record['assigned']),
    skipped: count(record['skipped']),
  };
}

function count(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}
