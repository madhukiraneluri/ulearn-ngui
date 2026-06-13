import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ContentBlock, ContentBlockType } from '../../models';
import { AdminCurriculumService } from '../services/admin-curriculum.service';
import { AdminLessonContentService } from '../services/admin-lesson-content.service';
import { ContentBulkImportService } from '../services/content-bulk-import.service';
import {
  BLOCK_TYPE_REFERENCE,
  BulkContentBlockInput,
  BulkContentImportResult,
  SAMPLE_CONTENT_JSON,
  buildContentChatbotPrompt,
  downloadSampleContentJson
} from '../services/content-bulk-import.util';
import type { ContentBulkImportMode } from '../services/content-bulk-import.service';
import { ToastService } from '../../core/services/toast';
import { BlockHeading } from '../../shared/components/blocks/block-heading/block-heading';
import { BlockText } from '../../shared/components/blocks/block-text/block-text';
import { BlockImage } from '../../shared/components/blocks/block-image/block-image';
import { BlockTwoColumn } from '../../shared/components/blocks/block-two-column/block-two-column';
import { BlockCallout } from '../../shared/components/blocks/block-callout/block-callout';
import { BlockCode } from '../../shared/components/blocks/block-code/block-code';
import { BlockQuote } from '../../shared/components/blocks/block-quote/block-quote';
import { BlockDivider } from '../../shared/components/blocks/block-divider/block-divider';
import { BlockGallery } from '../../shared/components/blocks/block-gallery/block-gallery';
import { BlockVideo } from '../../shared/components/blocks/block-video/block-video';

interface GalleryImageRow {
  imageUrl: string;
  caption: string;
}

@Component({
  selector: 'app-lesson-content-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    BlockHeading,
    BlockText,
    BlockImage,
    BlockTwoColumn,
    BlockCallout,
    BlockCode,
    BlockQuote,
    BlockDivider,
    BlockGallery,
    BlockVideo
  ],
  templateUrl: './lesson-content-editor.html',
  styleUrl: './lesson-content-editor.scss'
})
export class LessonContentEditor implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly curriculumService = inject(AdminCurriculumService);
  private readonly contentService = inject(AdminLessonContentService);
  private readonly bulkImportService = inject(ContentBulkImportService);
  private readonly toast = inject(ToastService);

  readonly blockTypeReference = BLOCK_TYPE_REFERENCE;

  readonly lessonId = signal<string | null>(null);
  readonly courseId = signal<string | null>(null);
  readonly lessonTitle = signal('');
  readonly blocks = signal<ContentBlock[]>([]);
  readonly selectedBlockId = signal<string | null>(null);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly showAddPicker = signal(false);
  readonly showBulkModal = signal(false);
  readonly bulkJsonText = signal('');
  readonly bulkContentTheme = signal('**CONTENT_THEME**');
  readonly bulkImportMode = signal<ContentBulkImportMode>('replace');
  readonly bulkImporting = signal(false);
  readonly bulkParseError = signal<string | null>(null);
  readonly bulkPreviewBlocks = signal<BulkContentBlockInput[]>([]);
  readonly bulkResults = signal<BulkContentImportResult[] | null>(null);
  readonly promptCopied = signal(false);

  readonly chatbotPrompt = computed(() =>
    buildContentChatbotPrompt({
      lessonTitle: this.lessonTitle() || '**LESSON_TITLE**',
      contentTheme: this.bulkContentTheme()
    })
  );

  readonly blockTypes: ContentBlockType[] = [
    'heading',
    'text',
    'image',
    'two_column',
    'callout',
    'code',
    'quote',
    'divider',
    'gallery',
    'video'
  ];

  readonly selectedBlock = computed(() => {
    const id = this.selectedBlockId();
    return this.blocks().find((b) => b.id === id) ?? null;
  });

  editContent = signal<Record<string, unknown>>({});
  galleryImages = signal<GalleryImageRow[]>([]);

  ngOnInit(): void {
    void this.loadPage();
  }

  private async loadPage(): Promise<void> {
    this.isLoading.set(true);
    const lessonId = this.route.snapshot.paramMap.get('lessonId');
    const courseId = this.route.snapshot.queryParamMap.get('courseId');

    if (!lessonId) {
      this.isLoading.set(false);
      return;
    }

    this.lessonId.set(lessonId);
    this.courseId.set(courseId);

    const lesson = await this.curriculumService.getLesson(lessonId);
    if (!lesson) {
      this.toast.error('Lesson not found');
      this.isLoading.set(false);
      return;
    }

    this.lessonTitle.set(lesson.title);

    const blocks = await this.contentService.getBlocksForLesson(lessonId);
    this.blocks.set(blocks);
    if (blocks.length > 0) {
      this.selectBlock(blocks[0].id);
    }
    this.isLoading.set(false);
  }

  backLink(): string[] {
    return ['/admin/curriculum'];
  }

  backQuery(): { courseId: string } | null {
    const id = this.courseId();
    return id ? { courseId: id } : null;
  }

  blockLabel(type: ContentBlockType): string {
    return this.contentService.blockTypeLabel(type);
  }

  selectBlock(blockId: string): void {
    this.selectedBlockId.set(blockId);
    const block = this.blocks().find((b) => b.id === blockId);
    if (block) {
      this.editContent.set({ ...block.content });
      if (block.type === 'gallery') {
        const imgs = (block.content['images'] as GalleryImageRow[]) ?? [];
        this.galleryImages.set(
          imgs.length > 0 ? imgs.map((i) => ({ imageUrl: i.imageUrl ?? '', caption: i.caption ?? '' })) : [{ imageUrl: '', caption: '' }]
        );
      }
    }
  }

  updateField(key: string, value: unknown): void {
    this.editContent.update((c) => ({ ...c, [key]: value }));
  }

  updateNestedField(parent: 'left' | 'right', key: string, value: string): void {
    this.editContent.update((c) => {
      const col = { ...(c[parent] as Record<string, unknown> ?? {}), [key]: value };
      return { ...c, [parent]: col };
    });
  }

  addGalleryRow(): void {
    this.galleryImages.update((rows) => [...rows, { imageUrl: '', caption: '' }]);
  }

  removeGalleryRow(index: number): void {
    this.galleryImages.update((rows) => rows.filter((_, i) => i !== index));
  }

  updateGalleryRow(index: number, field: keyof GalleryImageRow, value: string): void {
    this.galleryImages.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  async saveSelectedBlock(): Promise<void> {
    const block = this.selectedBlock();
    if (!block) return;

    let content = { ...this.editContent() };
    if (block.type === 'gallery') {
      content = {
        ...content,
        images: this.galleryImages().filter((i) => i.imageUrl.trim())
      };
    }

    this.isSaving.set(true);
    try {
      const updated = await this.contentService.updateBlock(block.id, { content });
      if (updated) {
        this.blocks.update((list) =>
          list.map((b) => (b.id === updated.id ? updated : b))
        );
        this.toast.success('Block saved');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
    }
  }

  async addBlock(type: ContentBlockType): Promise<void> {
    const lessonId = this.lessonId();
    if (!lessonId) return;

    const content = this.contentService.defaultContentForType(type);
    const orderIndex = this.blocks().length;

    this.isSaving.set(true);
    try {
      const created = await this.contentService.createBlock(lessonId, {
        type,
        content,
        orderIndex
      });
      if (created) {
        this.blocks.update((list) => [...list, created]);
        this.selectBlock(created.id);
        this.showAddPicker.set(false);
        this.toast.success('Block added');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add block';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteBlock(block: ContentBlock): Promise<void> {
    if (!confirm(`Delete this ${this.blockLabel(block.type)} block?`)) return;

    const ok = await this.contentService.deleteBlock(block.id);
    if (ok) {
      const remaining = this.blocks().filter((b) => b.id !== block.id);
      this.blocks.set(remaining);
      const lessonId = this.lessonId();
      if (lessonId) {
        await this.contentService.reorderBlocks(
          lessonId,
          remaining.map((b) => b.id)
        );
        const refreshed = await this.contentService.getBlocksForLesson(lessonId);
        this.blocks.set(refreshed);
      }
      if (this.selectedBlockId() === block.id) {
        this.selectedBlockId.set(remaining[0]?.id ?? null);
        if (remaining[0]) this.selectBlock(remaining[0].id);
      }
      this.toast.success('Block deleted');
    } else {
      this.toast.error('Could not delete block');
    }
  }

  async moveBlock(block: ContentBlock, direction: 'up' | 'down'): Promise<void> {
    const lessonId = this.lessonId();
    if (!lessonId) return;

    const list = [...this.blocks()];
    const idx = list.findIndex((b) => b.id === block.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;

    [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
    const ok = await this.contentService.reorderBlocks(
      lessonId,
      list.map((b) => b.id)
    );
    if (ok) {
      const refreshed = await this.contentService.getBlocksForLesson(lessonId);
      this.blocks.set(refreshed);
    } else {
      this.toast.error('Could not reorder blocks');
    }
  }

  previewContent(): Record<string, unknown> {
    const block = this.selectedBlock();
    if (!block) return {};
    if (block.type === 'gallery') {
      return {
        ...this.editContent(),
        images: this.galleryImages().filter((i) => i.imageUrl.trim())
      };
    }
    return this.editContent();
  }

  openBulkModal(): void {
    this.bulkJsonText.set('');
    this.bulkContentTheme.set('**CONTENT_THEME**');
    this.bulkPreviewBlocks.set([]);
    this.bulkParseError.set(null);
    this.bulkResults.set(null);
    this.promptCopied.set(false);
    this.showBulkModal.set(true);
  }

  closeBulkModal(): void {
    this.showBulkModal.set(false);
  }

  onContentThemeChange(value: string): void {
    this.bulkContentTheme.set(value);
    this.promptCopied.set(false);
  }

  onImportModeChange(value: ContentBulkImportMode): void {
    this.bulkImportMode.set(value);
  }

  onBulkJsonChange(value: string): void {
    this.bulkJsonText.set(value);
    this.bulkResults.set(null);
    this.updateBulkPreview(value);
  }

  private updateBulkPreview(raw: string): void {
    if (!raw.trim()) {
      this.bulkPreviewBlocks.set([]);
      this.bulkParseError.set(null);
      return;
    }
    const { payload, error } = this.bulkImportService.parseJsonText(raw);
    if (error || !payload) {
      this.bulkPreviewBlocks.set([]);
      this.bulkParseError.set(error ?? 'Invalid JSON');
      return;
    }
    this.bulkParseError.set(null);
    this.bulkPreviewBlocks.set(payload.contentBlocks);
  }

  async onBulkFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const { payload, error } = await this.bulkImportService.parseJsonFile(file);
    if (error || !payload) {
      this.toast.error(error ?? 'Could not parse file');
      return;
    }
    const text = JSON.stringify(payload, null, 2);
    this.bulkJsonText.set(text);
    this.bulkPreviewBlocks.set(payload.contentBlocks);
    this.bulkParseError.set(null);
    (event.target as HTMLInputElement).value = '';
    this.toast.success('JSON loaded');
  }

  downloadSampleJson(): void {
    const slug = this.lessonTitle().toLowerCase().replace(/\s+/g, '-') || 'lesson';
    downloadSampleContentJson(`ulearn-content-${slug}.json`);
  }

  loadSampleIntoEditor(): void {
    const text = JSON.stringify(SAMPLE_CONTENT_JSON, null, 2);
    this.bulkJsonText.set(text);
    this.updateBulkPreview(text);
  }

  async copyChatbotPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.chatbotPrompt());
      this.promptCopied.set(true);
      this.toast.success('Prompt copied — replace **LESSON_TITLE** and **CONTENT_THEME** in the chatbot');
    } catch {
      this.toast.error('Could not copy to clipboard');
    }
  }

  async runBulkImport(): Promise<void> {
    const lessonId = this.lessonId();
    if (!lessonId) return;

    const raw = this.bulkJsonText().trim();
    if (!raw) {
      this.toast.error('Paste JSON first');
      return;
    }

    const { payload, error } = this.bulkImportService.parseJsonText(raw);
    if (error || !payload) {
      this.toast.error(error ?? 'Invalid JSON');
      return;
    }

    const mode = this.bulkImportMode();
    if (mode === 'replace' && this.blocks().length > 0) {
      const ok = confirm('Replace mode will delete all existing blocks. Continue?');
      if (!ok) return;
    }

    this.bulkImporting.set(true);
    this.bulkResults.set(null);
    try {
      const results = await this.bulkImportService.importBlocks(
        lessonId,
        payload,
        mode,
        this.blocks().map((b) => b.id)
      );
      this.bulkResults.set(results);

      const refreshed = await this.contentService.getBlocksForLesson(lessonId);
      this.blocks.set(refreshed);
      if (refreshed.length > 0) {
        this.selectBlock(refreshed[0].id);
      } else {
        this.selectedBlockId.set(null);
      }

      const ok = results.filter((r) => r.success).length;
      const fail = results.filter((r) => !r.success).length;
      if (fail === 0) {
        this.toast.success(`Imported ${ok} block(s)`);
        this.closeBulkModal();
      } else if (ok === 0) {
        this.toast.error('Import failed');
      } else {
        this.toast.success(`Imported ${ok}; ${fail} failed`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      this.toast.error(msg);
    } finally {
      this.bulkImporting.set(false);
    }
  }
}
