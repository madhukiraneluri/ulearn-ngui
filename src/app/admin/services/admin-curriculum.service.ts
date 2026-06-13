import { Injectable } from '@angular/core';
import { CurriculumLesson, CurriculumModule } from '../../models';
import { supabase } from '../../core/supabase.client';

export interface ModuleInput {
  title: string;
  description: string;
  order: number;
}

export interface LessonInput {
  title: string;
  description: string;
  durationMinutes: number;
  isFree: boolean;
  order: number;
}

export interface LessonRow extends CurriculumLesson {
  moduleId: string;
}

@Injectable({ providedIn: 'root' })
export class AdminCurriculumService {
  async getCurriculumForCourse(courseId: string): Promise<CurriculumModule[]> {
    const { data: modules, error: modErr } = await supabase
      .from('course_curriculum')
      .select('id, title, description, order')
      .eq('course_id', courseId)
      .order('order', { ascending: true });

    if (modErr) {
      console.error('AdminCurriculumService.getCurriculumForCourse:', modErr);
      return [];
    }

    const moduleIds = (modules ?? []).map((m) => m.id as string);
    const lessonsMap: Record<string, CurriculumLesson[]> = {};

    if (moduleIds.length > 0) {
      const { data: lessons, error: lesErr } = await supabase
        .from('course_lessons')
        .select(
          'id, module_id, title, description, duration_minutes, is_free, order, resource_url, resource_type'
        )
        .in('module_id', moduleIds)
        .order('order', { ascending: true });

      if (lesErr) {
        console.error('AdminCurriculumService.getCurriculumForCourse lessons:', lesErr);
      } else {
        for (const row of lessons ?? []) {
          const key = row.module_id as string;
          lessonsMap[key] = lessonsMap[key] ?? [];
          lessonsMap[key].push(this.mapLesson(row as Record<string, unknown>));
        }
      }
    }

    return (modules ?? []).map((m) => ({
      id: String(m.id),
      title: String(m.title),
      description: String(m.description ?? ''),
      order: Number(m.order),
      lessons: lessonsMap[m.id as string] ?? []
    }));
  }

  async getLesson(lessonId: string): Promise<LessonRow | null> {
    const { data, error } = await supabase
      .from('course_lessons')
      .select(
        'id, module_id, title, description, duration_minutes, is_free, order, resource_url, resource_type'
      )
      .eq('id', lessonId)
      .maybeSingle();

    if (error || !data) return null;
    const lesson = this.mapLesson(data as Record<string, unknown>);
    return { ...lesson, moduleId: String(data.module_id) };
  }

  async getCourseIdForModule(moduleId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('course_curriculum')
      .select('course_id')
      .eq('id', moduleId)
      .maybeSingle();

    if (error || !data) return null;
    return String(data.course_id);
  }

  async createModule(courseId: string, input: ModuleInput): Promise<CurriculumModule | null> {
    const { data, error } = await supabase
      .from('course_curriculum')
      .insert({
        course_id: courseId,
        title: input.title,
        description: input.description,
        order: input.order
      })
      .select('id, title, description, order')
      .single();

    if (error) {
      console.error('AdminCurriculumService.createModule:', error);
      throw new Error(error.message);
    }

    return {
      id: String(data.id),
      title: String(data.title),
      description: String(data.description ?? ''),
      order: Number(data.order),
      lessons: []
    };
  }

  async updateModule(
    moduleId: string,
    partial: Partial<ModuleInput>
  ): Promise<CurriculumModule | null> {
    const payload: Record<string, unknown> = {};
    if (partial.title != null) payload['title'] = partial.title;
    if (partial.description != null) payload['description'] = partial.description;
    if (partial.order != null) payload['order'] = partial.order;

    const { data, error } = await supabase
      .from('course_curriculum')
      .update(payload)
      .eq('id', moduleId)
      .select('id, title, description, order')
      .single();

    if (error) {
      console.error('AdminCurriculumService.updateModule:', error);
      throw new Error(error.message);
    }

    return {
      id: String(data.id),
      title: String(data.title),
      description: String(data.description ?? ''),
      order: Number(data.order),
      lessons: []
    };
  }

  async deleteModule(moduleId: string): Promise<boolean> {
    const courseId = await this.getCourseIdForModule(moduleId);

    const { error } = await supabase.from('course_curriculum').delete().eq('id', moduleId);
    if (error) {
      console.error('AdminCurriculumService.deleteModule:', error);
      return false;
    }

    if (courseId) await this.syncCourseStats(courseId);
    return true;
  }

  async reorderModules(courseId: string, orderedModuleIds: string[]): Promise<boolean> {
    const updates = orderedModuleIds.map((id, index) =>
      supabase.from('course_curriculum').update({ order: index + 1 }).eq('id', id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error('AdminCurriculumService.reorderModules:', failed.error);
      return false;
    }
    return true;
  }

  async createLesson(moduleId: string, input: LessonInput): Promise<CurriculumLesson | null> {
    const { data, error } = await supabase
      .from('course_lessons')
      .insert({
        module_id: moduleId,
        title: input.title,
        description: input.description,
        duration_minutes: input.durationMinutes,
        is_free: input.isFree,
        order: input.order
      })
      .select(
        'id, title, description, duration_minutes, is_free, order, resource_url, resource_type'
      )
      .single();

    if (error) {
      console.error('AdminCurriculumService.createLesson:', error);
      throw new Error(error.message);
    }

    const courseId = await this.getCourseIdForModule(moduleId);
    if (courseId) await this.syncCourseStats(courseId);

    return this.mapLesson(data as Record<string, unknown>);
  }

  async updateLesson(lessonId: string, partial: Partial<LessonInput>): Promise<CurriculumLesson | null> {
    const payload: Record<string, unknown> = {};
    if (partial.title != null) payload['title'] = partial.title;
    if (partial.description != null) payload['description'] = partial.description;
    if (partial.durationMinutes != null) payload['duration_minutes'] = partial.durationMinutes;
    if (partial.isFree != null) payload['is_free'] = partial.isFree;
    if (partial.order != null) payload['order'] = partial.order;

    const { data, error } = await supabase
      .from('course_lessons')
      .update(payload)
      .eq('id', lessonId)
      .select(
        'id, title, description, duration_minutes, is_free, order, resource_url, resource_type'
      )
      .single();

    if (error) {
      console.error('AdminCurriculumService.updateLesson:', error);
      throw new Error(error.message);
    }

    return this.mapLesson(data as Record<string, unknown>);
  }

  async deleteLesson(lessonId: string, moduleId: string): Promise<boolean> {
    const courseId = await this.getCourseIdForModule(moduleId);

    const { error } = await supabase.from('course_lessons').delete().eq('id', lessonId);
    if (error) {
      console.error('AdminCurriculumService.deleteLesson:', error);
      return false;
    }

    if (courseId) await this.syncCourseStats(courseId);
    return true;
  }

  async reorderLessons(moduleId: string, orderedLessonIds: string[]): Promise<boolean> {
    const updates = orderedLessonIds.map((id, index) =>
      supabase.from('course_lessons').update({ order: index + 1 }).eq('id', id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error('AdminCurriculumService.reorderLessons:', failed.error);
      return false;
    }
    return true;
  }

  async clearCurriculumForCourse(courseId: string): Promise<boolean> {
    const { error } = await supabase
      .from('course_curriculum')
      .delete()
      .eq('course_id', courseId);

    if (error) {
      console.error('AdminCurriculumService.clearCurriculumForCourse:', error);
      return false;
    }

    await this.syncCourseStats(courseId);
    return true;
  }

  async syncCourseStats(courseId: string): Promise<void> {
    const { data: modules, error: modErr } = await supabase
      .from('course_curriculum')
      .select('id')
      .eq('course_id', courseId);

    if (modErr) {
      console.error('AdminCurriculumService.syncCourseStats:', modErr);
      return;
    }

    const moduleIds = (modules ?? []).map((m) => m.id as string);
    if (moduleIds.length === 0) {
      await supabase
        .from('courses')
        .update({ total_lessons: 0, live_class_count: 0 })
        .eq('id', courseId);
      return;
    }

    const { count, error: countErr } = await supabase
      .from('course_lessons')
      .select('*', { count: 'exact', head: true })
      .in('module_id', moduleIds);

    if (countErr) {
      console.error('AdminCurriculumService.syncCourseStats count:', countErr);
      return;
    }

    const lessonCount = count ?? 0;
    await supabase
      .from('courses')
      .update({ total_lessons: lessonCount, live_class_count: lessonCount })
      .eq('id', courseId);
  }

  private mapLesson(row: Record<string, unknown>): CurriculumLesson {
    return {
      id: String(row['id']),
      title: String(row['title']),
      description: String(row['description'] ?? ''),
      durationMinutes: Number(row['duration_minutes'] ?? 0),
      isFree: Boolean(row['is_free']),
      order: Number(row['order']),
      resourceUrl: (row['resource_url'] as string) || undefined,
      resourceType: (row['resource_type'] as 'video' | 'file') || undefined,
      videoUrl:
        row['resource_type'] === 'video' && row['resource_url']
          ? String(row['resource_url'])
          : undefined
    };
  }
}
