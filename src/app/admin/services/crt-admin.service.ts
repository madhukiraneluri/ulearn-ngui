
import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export interface CrtPath {
  id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
}

export interface CrtModule {
  id: string;
  path_id: string;
  title: string;
  sort_order: number;
  created_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class CrtAdminService {
  async listPaths(): Promise<CrtPath[]> {
    const { data, error } = await supabase
      .from('crt_paths')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as CrtPath[];
  }

  async createPath(input: {
    title: string;
    description?: string;
  }): Promise<CrtPath> {
    const { data, error } = await supabase
      .from('crt_paths')
      .insert({
        title: input.title.trim(),
        description: input.description?.trim() || null,
        status: 'draft',
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as CrtPath;
  }

  async updatePath(
    id: string,
    input: {
      title: string;
      description?: string;
      status: 'draft' | 'published';
    },
  ): Promise<CrtPath> {
    const { data, error } = await supabase
      .from('crt_paths')
      .update({
        title: input.title.trim(),
        description: input.description?.trim() || null,
        status: input.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as CrtPath;
  }

  async listModules(pathId: string): Promise<CrtModule[]> {
    const { data, error } = await supabase
      .from('crt_modules')
      .select('*')
      .eq('path_id', pathId)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as CrtModule[];
  }

  async createModule(
    pathId: string,
    title: string,
    sortOrder: number,
  ): Promise<CrtModule> {
    const { data, error } = await supabase
      .from('crt_modules')
      .insert({
        path_id: pathId,
        title: title.trim(),
        sort_order: sortOrder,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as CrtModule;
  }

  async updateModule(
    id: string,
    input: {
      title: string;
      sort_order: number;
    },
  ): Promise<CrtModule> {
    const { data, error } = await supabase
      .from('crt_modules')
      .update({
        title: input.title.trim(),
        sort_order: input.sort_order,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as CrtModule;
  }

  async reorderModules(
    modules: Array<{ id: string; sort_order: number }>,
  ): Promise<void> {
    for (const module of modules) {
      const { error } = await supabase
        .from('crt_modules')
        .update({ sort_order: module.sort_order })
        .eq('id', module.id);

      if (error) throw new Error(error.message);
    }
  }
}
