import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export interface CrtPathAssignment {
  pathId: string;
  batchId: string;
  assignedAt: string;
  assignedBy: string | null;
  pathTitle: string;
  batchName: string;
}

@Injectable({ providedIn: 'root' })
export class CrtPathAssignmentsService {
  async list(): Promise<CrtPathAssignment[]> {
    const { data, error } = await supabase
      .from('crt_path_assignments')
      .select('path_id, batch_id, assigned_at, assigned_by')
      .order('assigned_at', { ascending: false });

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const pathIds = [...new Set(rows.map((row) => String(row.path_id)))];
    const batchIds = [...new Set(rows.map((row) => String(row.batch_id)))];

    const [{ data: paths, error: pathError }, { data: batches, error: batchError }] =
      await Promise.all([
        supabase.from('crt_paths').select('id, title').in('id', pathIds),
        supabase.from('batches').select('id, name').in('id', batchIds),
      ]);

    if (pathError) throw new Error(pathError.message);
    if (batchError) throw new Error(batchError.message);

    const pathTitles = new Map(
      (paths ?? []).map((path) => [String(path.id), String(path.title)]),
    );
    const batchNames = new Map(
      (batches ?? []).map((batch) => [String(batch.id), String(batch.name)]),
    );

    return rows.map((row) => ({
      pathId: String(row.path_id),
      batchId: String(row.batch_id),
      assignedAt: String(row.assigned_at),
      assignedBy: (row.assigned_by as string | null) ?? null,
      pathTitle: pathTitles.get(String(row.path_id)) ?? 'Unknown path',
      batchName: batchNames.get(String(row.batch_id)) ?? 'Unknown batch',
    }));
  }

  async assign(pathId: string, batchId: string): Promise<void> {
    const assignedBy = await this.resolveAssignedBy();
    const { error } = await supabase.from('crt_path_assignments').insert({
      path_id: pathId,
      batch_id: batchId,
      assigned_by: assignedBy,
    });

    if (error) {
      if (error.code === '23505') {
        throw new Error('This learning path is already assigned to that batch.');
      }
      throw new Error(error.message);
    }
  }

  async unassign(pathId: string, batchId: string): Promise<void> {
    const { error } = await supabase
      .from('crt_path_assignments')
      .delete()
      .eq('path_id', pathId)
      .eq('batch_id', batchId);

    if (error) throw new Error(error.message);
  }

  private async resolveAssignedBy(): Promise<string | null> {
    const { data: user } = await supabase.auth.getUser();
    return user.user?.id ?? null;
  }
}
