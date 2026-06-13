import { Injectable, inject } from '@angular/core';
import { AdminCurriculumService } from './admin-curriculum.service';
import {
  CurriculumBulkImportMode,
  CurriculumBulkImportResult,
  CurriculumBulkPayload,
  parseCurriculumBulkText
} from './curriculum-bulk-import.util';

@Injectable({ providedIn: 'root' })
export class CurriculumBulkImportService {
  private readonly curriculumService = inject(AdminCurriculumService);

  parseText(raw: string): { payload: CurriculumBulkPayload | null; error?: string } {
    return parseCurriculumBulkText(raw);
  }

  parseTextFile(file: File): Promise<{ payload: CurriculumBulkPayload | null; error?: string }> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(this.parseText(String(reader.result ?? '')));
      reader.onerror = () => resolve({ payload: null, error: 'Could not read file.' });
      reader.readAsText(file);
    });
  }

  async importCurriculum(
    courseId: string,
    payload: CurriculumBulkPayload,
    mode: CurriculumBulkImportMode
  ): Promise<CurriculumBulkImportResult[]> {
    const results: CurriculumBulkImportResult[] = [];

    if (mode === 'replace') {
      const cleared = await this.curriculumService.clearCurriculumForCourse(courseId);
      if (!cleared) {
        return [
          {
            path: 'course',
            title: 'Curriculum',
            success: false,
            message: 'Could not clear existing curriculum.'
          }
        ];
      }
      results.push({
        path: 'course',
        title: 'Replace mode',
        success: true,
        message: 'Existing modules and lessons removed.'
      });
    }

    let moduleOrderOffset = 0;
    if (mode === 'append') {
      const existing = await this.curriculumService.getCurriculumForCourse(courseId);
      moduleOrderOffset = existing.reduce((max, m) => Math.max(max, m.order), 0);
    }

    for (const mod of payload.modules) {
      const moduleOrder = mode === 'append' ? moduleOrderOffset + mod.order : mod.order;
      const modulePath = `Module ${moduleOrder}: ${mod.title}`;

      try {
        const createdMod = await this.curriculumService.createModule(courseId, {
          title: mod.title,
          description: '',
          order: moduleOrder
        });

        if (!createdMod) {
          results.push({
            path: modulePath,
            title: mod.title,
            success: false,
            message: 'Failed to create module.'
          });
          continue;
        }

        results.push({
          path: modulePath,
          title: mod.title,
          success: true,
          message: `Created with ${mod.lessons.length} lesson(s).`
        });

        for (const lesson of mod.lessons) {
          const lessonPath = `${modulePath} → ${lesson.title}`;
          try {
            await this.curriculumService.createLesson(createdMod.id, {
              title: lesson.title,
              description: '',
              durationMinutes: lesson.durationMinutes,
              isFree: lesson.isFree,
              order: lesson.order
            });

            results.push({
              path: lessonPath,
              title: lesson.title,
              success: true,
              message: lesson.isFree ? 'Created (free preview).' : 'Created.'
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Lesson import failed';
            results.push({
              path: lessonPath,
              title: lesson.title,
              success: false,
              message: msg
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Module import failed';
        results.push({
          path: modulePath,
          title: mod.title,
          success: false,
          message: msg
        });
      }
    }

    await this.curriculumService.syncCourseStats(courseId);
    return results;
  }
}
