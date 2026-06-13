import { Injectable, inject } from '@angular/core';
import { AdminLessonContentService } from './admin-lesson-content.service';
import {
  BulkContentImportResult,
  BulkContentPayload,
  parseBulkContentJson
} from './content-bulk-import.util';

export type ContentBulkImportMode = 'replace' | 'append';

@Injectable({ providedIn: 'root' })
export class ContentBulkImportService {
  private readonly contentService = inject(AdminLessonContentService);

  parseJsonText(raw: string): { payload: BulkContentPayload | null; error?: string } {
    return parseBulkContentJson(raw);
  }

  parseJsonFile(file: File): Promise<{ payload: BulkContentPayload | null; error?: string }> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(this.parseJsonText(String(reader.result ?? '')));
      reader.onerror = () => resolve({ payload: null, error: 'Could not read file.' });
      reader.readAsText(file);
    });
  }

  async importBlocks(
    lessonId: string,
    payload: BulkContentPayload,
    mode: ContentBulkImportMode,
    existingBlockIds: string[]
  ): Promise<BulkContentImportResult[]> {
    const results: BulkContentImportResult[] = [];

    if (mode === 'replace' && existingBlockIds.length > 0) {
      for (const id of existingBlockIds) {
        await this.contentService.deleteBlock(id);
      }
      results.push({
        path: 'existing',
        success: true,
        message: `Removed ${existingBlockIds.length} existing block(s).`
      });
    }

    const orderOffset = mode === 'append' ? existingBlockIds.length : 0;

    for (let i = 0; i < payload.contentBlocks.length; i++) {
      const block = payload.contentBlocks[i];
      const path = `Block ${block.order}: ${block.type}`;

      try {
        await this.contentService.createBlock(lessonId, {
          type: block.type,
          content: block.content,
          orderIndex: orderOffset + i
        });
        results.push({ path, success: true, message: 'Created.' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Create failed';
        results.push({ path, success: false, message: msg });
      }
    }

    return results;
  }
}
