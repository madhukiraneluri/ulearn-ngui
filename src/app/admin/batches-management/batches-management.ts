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
import { AdminBatchesService, AdminBatchRow } from '../services/admin-batches.service';
import { AdminCourseService, AdminCourseRow } from '../services/admin-course.service';
import { ToastService } from '../../core/services/toast';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { AdminCourseSearchSelect } from '../components/admin-course-search-select/admin-course-search-select';
import type { BatchStatus } from '../../models';

@Component({
  selector: 'app-batches-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, AdminCourseSearchSelect],
  templateUrl: './batches-management.html',
  styleUrl: './batches-management.scss'
})
export class BatchesManagement implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly batchesService = inject(AdminBatchesService);
  private readonly courseService = inject(AdminCourseService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly batches = signal<AdminBatchRow[]>([]);
  readonly courses = signal<AdminCourseRow[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly expandedBatchId = signal<string | null>(null);
  readonly members = signal<
    Array<{ id: string; userName: string; userEmail: string | null; addedAt: string }>
  >([]);
  readonly loadingMembers = signal(false);

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
        await this.batchesService.create({
          courseId: v.courseId,
          name: v.name,
          startDate: v.startDate || null,
          endDate: v.endDate || null,
          status: v.status,
          notes: v.notes || null
        });
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

  async toggleExpand(batchId: string): Promise<void> {
    if (this.expandedBatchId() === batchId) {
      this.expandedBatchId.set(null);
      return;
    }
    this.expandedBatchId.set(batchId);
    this.loadingMembers.set(true);
    const list = await this.batchesService.listMembers(batchId);
    this.members.set(list);
    this.loadingMembers.set(false);
  }

  isExpanded(batchId: string): boolean {
    return this.expandedBatchId() === batchId;
  }

  async removeMember(memberId: string, userName: string): Promise<void> {
    if (
      !(await this.confirmDialog.confirm({
        title: 'Remove from batch',
        message: `Remove ${userName} from this batch?`,
        confirmLabel: 'Remove',
        variant: 'danger'
      }))
    ) {
      return;
    }

    const ok = await this.batchesService.removeMember(memberId);
    if (ok) {
      this.toast.success('Removed from batch');
      const batchId = this.expandedBatchId();
      if (batchId) {
        this.members.set(await this.batchesService.listMembers(batchId));
        await this.load();
      }
    } else {
      this.toast.error('Could not remove member');
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
