import { Injectable } from '@angular/core';
import { ContentBlock, ContentBlockType, Course, CurriculumLesson, LessonProgress, LessonWithBlocks } from '../../models';
import { supabase } from '../../core/supabase.client';
import { CourseService } from './course.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LearnService {
  constructor(private readonly courseService: CourseService) {}

  async getCourse(slug: string): Promise<Course | null> {
    return firstValueFrom(this.courseService.getCourseBySlug(slug));
  }

  async getLessonWithBlocks(lessonId: string): Promise<LessonWithBlocks | null> {
    const { data, error } = await supabase
      .from('course_lessons')
      .select(
        `
        id, module_id, title, description, duration_minutes, is_free, order, resource_url, resource_type,
        content_blocks ( id, type, order_index, content ),
        course_curriculum!inner ( id, order, course_id )
      `
      )
      .eq('id', lessonId)
      .single();

    if (error || !data) {
      console.error('getLessonWithBlocks error:', error);
      return null;
    }

    const blocks = ((data.content_blocks as Array<Record<string, unknown>>) ?? [])
      .sort((a, b) => Number(a['order_index']) - Number(b['order_index']))
      .map((b) => this.mapBlock(b));

    const curriculumRaw = data.course_curriculum;
    const module = (Array.isArray(curriculumRaw) ? curriculumRaw[0] : curriculumRaw) as {
      id: string;
      order: number;
    };
    const videoUrl =
      data.resource_type === 'video' && data.resource_url
        ? String(data.resource_url)
        : undefined;

    return {
      id: String(data.id),
      title: String(data.title),
      description: String(data.description ?? ''),
      durationMinutes: Number(data.duration_minutes ?? 0),
      isFree: Boolean(data.is_free),
      order: Number(data.order),
      resourceUrl: (data.resource_url as string) || undefined,
      resourceType: (data.resource_type as 'video' | 'file') || undefined,
      videoUrl,
      moduleId: String(module.id),
      moduleOrder: Number(module.order),
      contentBlocks: blocks
    };
  }

  async getLessonProgress(userId: string, lessonIds: string[]): Promise<LessonProgress[]> {
    if (lessonIds.length === 0) return [];

    const { data, error } = await supabase
      .from('lesson_progress')
      .select('lesson_id, completed, completed_at')
      .eq('user_id', userId)
      .in('lesson_id', lessonIds);

    if (error) {
      console.error('getLessonProgress error:', error);
      return [];
    }

    return (data ?? []).map((row) => ({
      lessonId: String(row.lesson_id),
      completed: Boolean(row.completed),
      completedAt: row.completed_at ?? undefined
    }));
  }

  async markLessonComplete(userId: string, lessonId: string): Promise<boolean> {
    const { error } = await supabase.from('lesson_progress').upsert(
      {
        user_id: userId,
        lesson_id: lessonId,
        completed: true,
        completed_at: new Date().toISOString()
      },
      { onConflict: 'user_id,lesson_id' }
    );

    if (error) {
      console.error('markLessonComplete error:', error);
      return false;
    }
    return true;
  }

  flattenLessons(course: Course): Array<CurriculumLesson & { moduleId: string; moduleOrder: number }> {
    const flat: Array<CurriculumLesson & { moduleId: string; moduleOrder: number }> = [];
    for (const mod of course.curriculum) {
      for (const lesson of mod.lessons) {
        flat.push({ ...lesson, moduleId: mod.id, moduleOrder: mod.order });
      }
    }
    return flat;
  }

  private mapBlock(raw: Record<string, unknown>): ContentBlock {
    return {
      id: String(raw['id']),
      type: raw['type'] as ContentBlockType,
      orderIndex: Number(raw['order_index']),
      content: (raw['content'] as Record<string, unknown>) ?? {}
    };
  }
}
