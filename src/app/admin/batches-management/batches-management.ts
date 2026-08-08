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
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { Router } from '@angular/router';
import { AdminBatchesService, AdminBatchRow } from '../services/admin-batches.service';
import { AdminCourseService, AdminCourseRow } from '../services/admin-course.service';
import { AdminStudentsService } from '../services/admin-students.service';
import { ToastService } from '../../core/services/toast';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { AdminCourseSearchSelect } from '../components/admin-course-search-select/admin-course-search-select';
import type { BatchStatus } from '../../models';

@Component({
  selector: 'app-batches-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, AdminCourseSearchSelect],
  templateUrl: './batches-management.html',
  styleUrl: './batches-management.scss'
})
export class BatchesManagement implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly batchesService = inject(AdminBatchesService);
  private readonly courseService = inject(AdminCourseService);
  private readonly studentsService = inject(AdminStudentsService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly batches = signal<AdminBatchRow[]>([]);
  readonly courses = signal<AdminCourseRow[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly showAddBatchModal = signal(false);
  readonly newBatchName = signal('');
  readonly newBatchCourseId = signal<string | null>(null);
  readonly newBatchStartDate = signal('');
  readonly newBatchEndDate = signal('');
  readonly newBatchNotes = signal('');
  readonly copyFromBatchIds = signal<string[]>([]);
  readonly isSavingAddBatch = signal(false);

  form!: FormGroup;

  ngOnInit(): void {
    this.form = this.fb.group({
      courseId: ['', Validators.required],
      name: ['', [Validators.required, Validators.minLength(2)]],
      startDate: [''],
      endDate: [''],
      status: ['active' as BatchStatus, Validators.required],
      notes: ['']
    });
    void this.load();
  }

  private async load(): Promise<void> {
    this.isLoading.set(true);
    const [batches, courses] = await Promise.all([
      this.batchesService.listAll(),
      this.courseService.listAll()
    ]);
    this.batches.set(batches);
    this.courses.set(courses);
    this.isLoading.set(false);
  }

  openBatch(batch: AdminBatchRow): void {
    void this.router.navigate(['/admin/batches', batch.id]);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({
      courseId: this.courses()[0]?.id ?? '',
      name: '',
      startDate: '',
      endDate: '',
      status: 'active',
      notes: ''
    });
    this.showForm.set(true);
  }

  openEdit(batch: AdminBatchRow): void {
    this.editingId.set(batch.id);
    this.form.reset({
      courseId: batch.courseId,
      name: batch.name,
      startDate: batch.startDate ?? '',
      endDate: batch.endDate ?? '',
      status: batch.status,
      notes: batch.notes ?? ''
    });
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  onCourseIdChange(id: string | null): void {
    this.form.patchValue({ courseId: id ?? '' });
  }

  async save(): Promise<void> {
    if (this.isSaving() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    this.isSaving.set(true);
    try {
      const id = this.editingId();
      if (id) {
        const ok = await this.batchesService.update(id, {
          courseId: v.courseId,
          name: v.name,
          startDate: v.startDate || null,
          endDate: v.endDate || null,
          status: v.status,
          notes: v.notes || null
        });
        if (!ok) throw new Error('Could not update batch');
        this.toast.success('Batch updated');
      } else {
        const created = await this.batchesService.create({
          courseId: v.courseId,
          name: v.name,
          startDate: v.startDate || null,
          endDate: v.endDate || null,
          status: v.status,
          notes: v.notes || null
        });
        if (!created) throw new Error('Could not create batch');
        this.toast.success('Batch created');
      }
      this.closeForm();
      await this.load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
    }
  }

  openAddBatchModal(): void {
    this.newBatchName.set('');
    this.newBatchCourseId.set(this.courses()[0]?.id ?? null);
    this.newBatchStartDate.set('');
    this.newBatchEndDate.set('');
    this.newBatchNotes.set('');
    this.copyFromBatchIds.set([]);
    this.showAddBatchModal.set(true);
  }

  closeAddBatchModal(): void {
    this.showAddBatchModal.set(false);
  }

  toggleCopyFromBatch(batchId: string): void {
    const cur = this.copyFromBatchIds();
    this.copyFromBatchIds.set(
      cur.includes(batchId) ? cur.filter((id) => id !== batchId) : [...cur, batchId]
    );
  }

  isCopyFromBatchSelected(batchId: string): boolean {
    return this.copyFromBatchIds().includes(batchId);
  }

  async submitAddBatch(): Promise<void> {
    const name = this.newBatchName().trim();
    const courseId = this.newBatchCourseId();
    if (!name) {
      this.toast.error('Batch name is required');
      return;
    }
    if (!courseId) {
      this.toast.error('Select a course');
      return;
    }

    this.isSavingAddBatch.set(true);
    try {
      const created = await this.batchesService.create({
        courseId,
        name,
        startDate: this.newBatchStartDate() || null,
        endDate: this.newBatchEndDate() || null,
        status: 'active' as BatchStatus,
        notes: this.newBatchNotes().trim() || null
      });

      if (!created) {
        throw new Error('Could not create batch');
      }

      const sourceIds = this.copyFromBatchIds();
      if (sourceIds.length > 0) {
        const userIds = await this.batchesService.collectMemberUserIds(sourceIds);
        let copied = 0;
        for (const userId of userIds) {
          try {
            await this.studentsService.addStudentToBatch(userId, created.id);
            copied++;
          } catch {
            /* skip failed copies */
          }
        }
        this.toast.success(
          copied > 0
            ? `Batch created with ${copied} student(s) copied`
            : 'Batch created (no students copied)'
        );
      } else {
        this.toast.success('Batch created');
      }

      this.closeAddBatchModal();
      await this.load();
      await this.router.navigate(['/admin/batches', created.id]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create batch';
      this.toast.error(msg);
    } finally {
      this.isSavingAddBatch.set(false);
    }
  }

  async deleteBatch(batch: AdminBatchRow): Promise<void> {
    if (
      !(await this.confirmDialog.confirm({
        title: 'Delete batch',
        message: `Delete batch "${batch.name}"?`,
        confirmLabel: 'Delete',
        variant: 'danger'
      }))
    ) {
      return;
    }

    const result = await this.batchesService.delete(batch.id);
    if (result.ok) {
      this.toast.success('Batch deleted');
      await this.load();
    } else {
      this.toast.error(result.message ?? 'Could not delete batch');
    }
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return iso;
    }
  }
}
