import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export type CrtCompanyPackStatus = 'draft' | 'published';

export interface CrtAdminCompanyPack {
  id: string;
  name: string;
  description: string | null;
  status: CrtCompanyPackStatus;
  created_at: string;
  updated_at: string;
}

export interface CrtAdminCompanyPackInput {
  name: string;
  description?: string | null;
}

export interface CrtCompanyPackMembership {
  pack_id: string;
  question_id: string;
  sort_order: number;
}

const PACK_COLUMNS = 'id, name, description, status, created_at, updated_at';
const MEMBERSHIP_COLUMNS = 'pack_id, question_id, sort_order';

@Injectable({ providedIn: 'root' })
export class CrtAdminPackService {
  async listPacks(): Promise<CrtAdminCompanyPack[]> {
    const { data, error } = await supabase
      .from('crt_company_packs')
      .select(PACK_COLUMNS)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.toPack(row));
  }

  async createPack(input: CrtAdminCompanyPackInput): Promise<CrtAdminCompanyPack> {
    const { data, error } = await supabase
      .from('crt_company_packs')
      .insert({
        name: this.packName(input.name),
        description: this.nullableDescription(input.description),
        status: 'draft',
      })
      .select(PACK_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Company pack was not created.');
    return this.toPack(data);
  }

  async updatePack(
    id: string,
    input: CrtAdminCompanyPackInput,
  ): Promise<CrtAdminCompanyPack> {
    const { data, error } = await supabase
      .from('crt_company_packs')
      .update({
        name: this.packName(input.name),
        description: this.nullableDescription(input.description),
      })
      .eq('id', id)
      .select(PACK_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Company pack was not updated.');
    return this.toPack(data);
  }

  async publishPack(id: string): Promise<CrtAdminCompanyPack> {
    return this.setStatus(id, 'published');
  }

  async unpublishPack(id: string): Promise<CrtAdminCompanyPack> {
    return this.setStatus(id, 'draft');
  }

  async deletePack(id: string): Promise<void> {
    const { error } = await supabase
      .from('crt_company_packs')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  async listPackQuestions(packId: string): Promise<CrtCompanyPackMembership[]> {
    const { data, error } = await supabase
      .from('crt_company_pack_questions')
      .select(MEMBERSHIP_COLUMNS)
      .eq('pack_id', packId)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.toMembership(row));
  }

  async attachQuestion(
    packId: string,
    questionId: string,
    sortOrder: number,
  ): Promise<CrtCompanyPackMembership> {
    const { data, error } = await supabase
      .from('crt_company_pack_questions')
      .insert({
        pack_id: packId,
        question_id: questionId,
        sort_order: this.sortOrder(sortOrder),
      })
      .select(MEMBERSHIP_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Question was not attached to the company pack.');
    return this.toMembership(data);
  }

  async updateQuestionSortOrder(
    packId: string,
    questionId: string,
    sortOrder: number,
  ): Promise<CrtCompanyPackMembership> {
    const { data, error } = await supabase
      .from('crt_company_pack_questions')
      .update({ sort_order: this.sortOrder(sortOrder) })
      .eq('pack_id', packId)
      .eq('question_id', questionId)
      .select(MEMBERSHIP_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Company pack question order was not updated.');
    return this.toMembership(data);
  }

  async removeQuestion(packId: string, questionId: string): Promise<void> {
    const { error } = await supabase
      .from('crt_company_pack_questions')
      .delete()
      .eq('pack_id', packId)
      .eq('question_id', questionId);

    if (error) throw new Error(error.message);
  }

  private async setStatus(
    id: string,
    status: CrtCompanyPackStatus,
  ): Promise<CrtAdminCompanyPack> {
    const { data, error } = await supabase
      .from('crt_company_packs')
      .update({ status })
      .eq('id', id)
      .select(PACK_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Company pack status was not updated.');
    return this.toPack(data);
  }

  private toPack(row: unknown): CrtAdminCompanyPack {
    const record = this.record(row);
    const status = record['status'];
    if (status !== 'draft' && status !== 'published') {
      throw new Error('Company pack status is not recognized.');
    }
    return {
      id: this.text(record['id'], 'pack id'),
      name: this.text(record['name'], 'pack name'),
      description: this.nullableText(record['description']),
      status,
      created_at: this.text(record['created_at'], 'created_at'),
      updated_at: this.text(record['updated_at'], 'updated_at'),
    };
  }

  private toMembership(row: unknown): CrtCompanyPackMembership {
    const record = this.record(row);
    return {
      pack_id: this.text(record['pack_id'], 'pack id'),
      question_id: this.text(record['question_id'], 'question id'),
      sort_order: this.sortOrder(record['sort_order']),
    };
  }

  private packName(value: string): string {
    const name = value.trim();
    if (!name) throw new Error('Company pack name is required.');
    return name;
  }

  private nullableDescription(value: string | null | undefined): string | null {
    const description = value?.trim() ?? '';
    return description ? description : null;
  }

  private sortOrder(value: unknown): number {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error('Question sort order must be zero or greater.');
    }
    return parsed;
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
