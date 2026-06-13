import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminCourseService, AdminCourseRow } from '../services/admin-course.service';
import {
  AdminCurriculumService,
  LessonInput,
  ModuleInput
} from '../services/admin-curriculum.service';
import { CurriculumLesson, CurriculumModule } from '../../models';
import { ToastService } from '../../core/services/toast';
import { CurriculumBulkImportService } from '../services/curriculum-bulk-import.service';
import {
  BULK_CURRICULUM_PLACEHOLDER,
  BULK_CURRICULUM_SAMPLE,
  BULK_FORMAT_EXAMPLE,
  BULK_FORMAT_HELP,
  CurriculumBulkImportResult,
  downloadSampleCurriculumText
} from '../services/curriculum-bulk-import.util';
import type { CurriculumBulkImportMode } from '../services/curriculum-bulk-import.util';

type FormMode = 'module' | 'lesson';

@Component({
  selector: 'app-curriculum-builder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './curriculum-builder.html',
  styleUrl: './curriculum-builder.scss'
})
export class CurriculumBuilder implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly courseService = inject(AdminCourseService);
  private readonly curriculumService = inject(AdminCurriculumService);
  private readonly bulkImportService = inject(CurriculumBulkImportService);
  private readonly toast = inject(ToastService);

  readonly bulkFormatHelp = BULK_FORMAT_HELP;
  readonly bulkFormatExample = BULK_FORMAT_EXAMPLE;

  readonly courses = signal<AdminCourseRow[]>([]);
  readonly selectedCourseId = signal<string | null>(null);
  readonly modules = signal<CurriculumModule[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly expandedModules = signal<Set<string>>(new Set());

  readonly showForm = signal(false);
  readonly formMode = signal<FormMode>('module');
  readonly editingModuleId = signal<string | null>(null);
  readonly editingLessonId = signal<string | null>(null);
  readonly activeModuleId = signal<string | null>(null);

  readonly showBulkModal = signal(false);
  readonly bulkText = signal(BULK_CURRICULUM_PLACEHOLDER);
  readonly bulkImportMode = signal<CurriculumBulkImportMode>('replace');
  readonly bulkImporting = signal(false);
  readonly bulkResults = signal<CurriculumBulkImportResult[] | null>(null);

  form!: FormGroup;

  ngOnInit(): void {
    this.buildForm();
    void this.initPage();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      durationMinutes: [30, [Validators.min(0)]],
      isFree: [false]
    });
  }

  private async initPage(): Promise<void> {
    this.isLoading.set(true);
    const list = await this.courseService.listAll();
    this.courses.set(list);

    const qp = this.route.snapshot.queryParamMap.get('courseId');
    const initial = qp && list.some((c) => c.id === qp) ? qp : list[0]?.id ?? null;
    if (initial) {
      this.selectedCourseId.set(initial);
      await this.loadCurriculum(initial);
    }
    this.isLoading.set(false);
  }

  async onCourseChange(event: Event): Promise<void> {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedCourseId.set(id);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { courseId: id },
      queryParamsHandling: 'merge'
    });
    await this.loadCurriculum(id);
  }

  private async loadCurriculum(courseId: string): Promise<void> {
    const data = await this.curriculumService.getCurriculumForCourse(courseId);
    this.modules.set(data);
    this.expandedModules.set(new Set(data.map((m) => m.id)));
  }

  toggleModule(moduleId: string): void {
    this.expandedModules.update((set) => {
      const next = new Set(set);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  isExpanded(moduleId: string): boolean {
    return this.expandedModules().has(moduleId);
  }

  openCreateModule(): void {
    this.formMode.set('module');
    this.editingModuleId.set(null);
    this.editingLessonId.set(null);
    this.activeModuleId.set(null);
    this.form.reset({ title: '', description: '', durationMinutes: 30, isFree: false });
    this.showForm.set(true);
  }

  openEditModule(mod: CurriculumModule): void {
    this.formMode.set('module');
    this.editingModuleId.set(mod.id);
    this.editingLessonId.set(null);
    this.form.patchValue({ title: mod.title, description: mod.description });
    this.showForm.set(true);
  }

  openCreateLesson(moduleId: string): void {
    this.formMode.set('lesson');
    this.editingModuleId.set(null);
    this.editingLessonId.set(null);
    this.activeModuleId.set(moduleId);
    this.form.reset({
      title: '',
      description: '',
      durationMinutes: 30,
      isFree: false
    });
    this.showForm.set(true);
  }

  openEditLesson(lesson: CurriculumLesson, moduleId: string): void {
    this.formMode.set('lesson');
    this.editingLessonId.set(lesson.id);
    this.editingModuleId.set(null);
    this.activeModuleId.set(moduleId);
    this.form.patchValue({
      title: lesson.title,
      description: lesson.description,
      durationMinutes: lesson.durationMinutes,
      isFree: lesson.isFree
    });
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingModuleId.set(null);
    this.editingLessonId.set(null);
    this.activeModuleId.set(null);
  }

  async saveForm(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const courseId = this.selectedCourseId();
    if (!courseId) return;

    const v = this.form.getRawValue();
    this.isSaving.set(true);

    try {
      if (this.formMode() === 'module') {
        const input: ModuleInput = {
          title: v.title,
          description: v.description ?? '',
          order: 0
        };
        const editId = this.editingModuleId();
        if (editId) {
          await this.curriculumService.updateModule(editId, input);
          this.toast.success('Module updated');
        } else {
          const mods = this.modules();
          input.order = mods.length + 1;
          await this.curriculumService.createModule(courseId, input);
          this.toast.success('Module created');
        }
      } else {
        const moduleId = this.activeModuleId();
        if (!moduleId) return;

        const input: LessonInput = {
          title: v.title,
          description: v.description ?? '',
          durationMinutes: Number(v.durationMinutes),
          isFree: Boolean(v.isFree),
          order: 0
        };
        const editLessonId = this.editingLessonId();
        if (editLessonId) {
          await this.curriculumService.updateLesson(editLessonId, input);
          this.toast.success('Lesson updated');
        } else {
          const mod = this.modules().find((m) => m.id === moduleId);
          input.order = (mod?.lessons.length ?? 0) + 1;
          await this.curriculumService.createLesson(moduleId, input);
          this.toast.success('Lesson created');
        }
      }
      this.closeForm();
      await this.loadCurriculum(courseId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteModule(mod: CurriculumModule): Promise<void> {
    if (!confirm(`Delete module "${mod.title}" and all its lessons?`)) return;
    const courseId = this.selectedCourseId();
    const ok = await this.curriculumService.deleteModule(mod.id);
    if (ok) {
      this.toast.success('Module deleted');
      if (courseId) await this.loadCurriculum(courseId);
    } else {
      this.toast.error('Could not delete module');
    }
  }

  async deleteLesson(lesson: CurriculumLesson, moduleId: string): Promise<void> {
    if (!confirm(`Delete lesson "${lesson.title}"?`)) return;
    const courseId = this.selectedCourseId();
    const ok = await this.curriculumService.deleteLesson(lesson.id, moduleId);
    if (ok) {
      this.toast.success('Lesson deleted');
      if (courseId) await this.loadCurriculum(courseId);
    } else {
      this.toast.error('Could not delete lesson');
    }
  }

  async moveModule(mod: CurriculumModule, direction: 'up' | 'down'): Promise<void> {
    const courseId = this.selectedCourseId();
    if (!courseId) return;

    const mods = [...this.modules()];
    const idx = mods.findIndex((m) => m.id === mod.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= mods.length) return;

    [mods[idx], mods[swapIdx]] = [mods[swapIdx], mods[idx]];
    const ok = await this.curriculumService.reorderModules(
      courseId,
      mods.map((m) => m.id)
    );
    if (ok) {
      await this.loadCurriculum(courseId);
    } else {
      this.toast.error('Could not reorder modules');
    }
  }

  async moveLesson(
    moduleId: string,
    lesson: CurriculumLesson,
    direction: 'up' | 'down'
  ): Promise<void> {
    const courseId = this.selectedCourseId();
    const mod = this.modules().find((m) => m.id === moduleId);
    if (!mod || !courseId) return;

    const lessons = [...mod.lessons];
    const idx = lessons.findIndex((l) => l.id === lesson.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= lessons.length) return;

    [lessons[idx], lessons[swapIdx]] = [lessons[swapIdx], lessons[idx]];
    const ok = await this.curriculumService.reorderLessons(
      moduleId,
      lessons.map((l) => l.id)
    );
    if (ok) {
      await this.loadCurriculum(courseId);
    } else {
      this.toast.error('Could not reorder lessons');
    }
  }

  lessonContentLink(lessonId: string): string[] {
    const courseId = this.selectedCourseId();
    return courseId
      ? ['/admin/curriculum/lesson', lessonId]
      : ['/admin/curriculum/lesson', lessonId];
  }

  lessonContentQuery(): { courseId: string } | null {
    const id = this.selectedCourseId();
    return id ? { courseId: id } : null;
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  selectedCourseTitle(): string {
    const id = this.selectedCourseId();
    return this.courses().find((c) => c.id === id)?.title ?? '';
  }

  openBulkModal(): void {
    this.bulkText.set(BULK_CURRICULUM_PLACEHOLDER);
    this.bulkResults.set(null);
    this.showBulkModal.set(true);
  }

  closeBulkModal(): void {
    this.showBulkModal.set(false);
    this.bulkResults.set(null);
  }

  onImportModeChange(event: Event): void {
    const v = (event.target as HTMLSelectElement).value as CurriculumBulkImportMode;
    this.bulkImportMode.set(v);
  }

  onBulkTextPaste(event: Event): void {
    this.bulkText.set((event.target as HTMLTextAreaElement).value);
    this.bulkResults.set(null);
  }

  async onBulkFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const { payload, error } = await this.bulkImportService.parseTextFile(file);
    if (error || !payload) {
      this.toast.error(error ?? 'Could not parse file');
      return;
    }
    this.bulkText.set(rebuildTextFromPayload(payload));
    this.bulkResults.set(null);
    (event.target as HTMLInputElement).value = '';
    this.toast.success('Loaded from file');
  }

  downloadSample(): void {
    const slug = this.selectedCourseTitle().toLowerCase().replace(/\s+/g, '-') || 'sample';
    downloadSampleCurriculumText(BULK_CURRICULUM_SAMPLE, `ulearn-curriculum-${slug}.txt`);
  }

  loadSampleIntoEditor(): void {
    this.bulkText.set(BULK_CURRICULUM_SAMPLE);
    this.bulkResults.set(null);
  }

  async runBulkImport(): Promise<void> {
    const courseId = this.selectedCourseId();
    if (!courseId) {
      this.toast.error('Select a course first');
      return;
    }

    const raw = this.bulkText().trim();
    if (!raw) {
      this.toast.error('Enter your module/lesson list');
      return;
    }

    const { payload, error } = this.bulkImportService.parseText(raw);
    if (error || !payload) {
      this.toast.error(error ?? 'Invalid format');
      return;
    }

    const mode = this.bulkImportMode();
    if (mode === 'replace' && this.modules().length > 0) {
      const ok = confirm(
        'Replace mode will delete all existing modules and lessons for this course. Continue?'
      );
      if (!ok) return;
    }

    this.bulkImporting.set(true);
    this.bulkResults.set(null);
    try {
      const results = await this.bulkImportService.importCurriculum(courseId, payload, mode);
      this.bulkResults.set(results);
      const ok = results.filter((r) => r.success).length;
      const fail = results.filter((r) => !r.success).length;
      await this.loadCurriculum(courseId);
      if (fail === 0) {
        this.toast.success(`Imported ${ok} item(s) successfully`);
        this.closeBulkModal();
      } else if (ok === 0) {
        this.toast.error('Import failed');
      } else {
        this.toast.success(`Imported ${ok} item(s); ${fail} failed`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      this.toast.error(msg);
    } finally {
      this.bulkImporting.set(false);
    }
  }
}

function rebuildTextFromPayload(payload: {
  modules: Array<{ order: number; title: string; lessons: Array<{ order: number; title: string }> }>;
}): string {
  return payload.modules
    .map((mod) => {
      const lessons = mod.lessons
        .map((l) => `{Lesson:${l.order}, ${l.title}}`)
        .join(', ');
      return `{Module:${mod.order}, ${mod.title}, ${lessons}}`;
    })
    .join('\n');
}
