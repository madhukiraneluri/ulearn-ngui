import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { ToastService } from '../../../core/services/toast';
import { CrtAdminService, CrtPath } from '../../services/crt-admin.service';
import { AdminBatchesService, AdminBatchRow } from '../../services/admin-batches.service';
import {
  CrtPathAssignment,
  CrtPathAssignmentsService,
} from '../../services/crt-path-assignments.service';
import { CrtShell } from '../crt-shell/crt-shell';

@Component({
  selector: 'app-crt-assignments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CrtShell],
  templateUrl: './crt-assignments.html',
  styleUrl: '../crt-admin.scss',
})
export class CrtAssignments implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly crtAdmin = inject(CrtAdminService);
  private readonly batchesService = inject(AdminBatchesService);
  private readonly assignmentsService = inject(CrtPathAssignmentsService);

  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly query = signal('');
  readonly showForm = signal(false);
  readonly paths = signal<CrtPath[]>([]);
  readonly batches = signal<AdminBatchRow[]>([]);
  readonly assignments = signal<CrtPathAssignment[]>([]);
  private readonly formHost = viewChild<ElementRef<HTMLElement>>('formHost');

  readonly form = this.fb.nonNullable.group({
    pathId: ['', Validators.required],
    batchId: ['', Validators.required],
  });

  readonly publishedPaths = computed(() =>
    this.paths()
      .filter((path) => path.status === 'published')
      .sort((a, b) => a.title.localeCompare(b.title)),
  );

  readonly visibleAssignments = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.assignments();
    return this.assignments().filter(
      (row) =>
        row.batchName.toLowerCase().includes(q) ||
        row.pathTitle.toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const [paths, batches, assignments] = await Promise.all([
        this.crtAdmin.listPaths(),
        this.batchesService.listAll(),
        this.assignmentsService.list(),
      ]);
      this.paths.set(paths);
      this.batches.set(batches);
      this.assignments.set(assignments);
    } catch (error: unknown) {
      this.assignments.set([]);
      this.loadError.set(
        error instanceof Error ? error.message : 'Could not load batch assignments.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  formatAssignedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  openCreate(): void {
    if (this.publishedPaths().length === 0) {
      this.toast.error('Publish a learning path before assigning it.');
      return;
    }
    if (this.batches().length === 0) {
      this.toast.error('Create a batch before assigning a path.');
      return;
    }
    this.form.reset({ pathId: '', batchId: '' });
    this.revealForm();
  }

  closeForm(): void {
    this.showForm.set(false);
  }

  async unassign(assignment: CrtPathAssignment): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Unassign path',
      message: `Remove ${assignment.pathTitle} from ${assignment.batchName}?`,
      confirmLabel: 'Unassign',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await this.assignmentsService.unassign(assignment.pathId, assignment.batchId);
      this.assignments.update((list) =>
        list.filter(
          (row) =>
            !(row.pathId === assignment.pathId && row.batchId === assignment.batchId),
        ),
      );
      this.toast.success('Path unassigned');
    } catch (error: unknown) {
      this.toast.error(
        error instanceof Error ? error.message : 'Could not unassign this path.',
      );
    }
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Select a learning path and a batch.');
      return;
    }

    const { pathId, batchId } = this.form.getRawValue();
    const path = this.paths().find((item) => item.id === pathId);
    if (!path || path.status !== 'published') {
      this.toast.error('Choose a published learning path.');
      return;
    }
    if (!this.batches().some((batch) => batch.id === batchId)) {
      this.toast.error('Choose a batch.');
      return;
    }

    const duplicate = this.assignments().some(
      (row) => row.pathId === pathId && row.batchId === batchId,
    );
    if (duplicate) {
      this.toast.error('This batch is already assigned to that learning path.');
      return;
    }

    this.saving.set(true);
    try {
      await this.assignmentsService.assign(pathId, batchId);
      const refreshed = await this.assignmentsService.list();
      this.assignments.set(refreshed);
      this.toast.success('Path assigned to batch');
      this.closeForm();
    } catch (error: unknown) {
      this.toast.error(
        error instanceof Error ? error.message : 'Could not save this assignment.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  private revealForm(): void {
    this.showForm.set(true);
    const timer = setTimeout(() => {
      this.formHost()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }
}
