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
import {
  CrtAnnouncement,
  CrtAnnouncementsService,
} from '../../services/crt-announcements.service';
import { CrtShell } from '../crt-shell/crt-shell';

@Component({
  selector: 'app-crt-announcements',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CrtShell],
  templateUrl: './crt-announcements.html',
  styleUrl: '../crt-admin.scss',
})
export class CrtAnnouncements implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly announcementsService = inject(CrtAnnouncementsService);

  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly actionId = signal<string | null>(null);
  readonly query = signal('');
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly announcements = signal<CrtAnnouncement[]>([]);

  private readonly formHost = viewChild<ElementRef<HTMLElement>>('formHost');

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(1)]],
    body: ['', [Validators.required, Validators.minLength(1)]],
    driveDate: [''],
  });

  readonly visibleAnnouncements = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.announcements();
    return this.announcements().filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        row.body.toLowerCase().includes(q) ||
        (row.drive_date ?? '').toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const rows = await this.announcementsService.listAnnouncements();
      this.announcements.set(rows);
    } catch (error: unknown) {
      this.announcements.set([]);
      this.loadError.set(
        error instanceof Error ? error.message : 'Could not load announcements.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  formatDateTime(value: string | null): string {
    if (!value) return '—';
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

  formatDriveDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({
      title: '',
      body: '',
      driveDate: '',
    });
    this.revealForm();
  }

  openEdit(row: CrtAnnouncement): void {
    this.editingId.set(row.id);
    this.form.reset({
      title: row.title,
      body: row.body,
      driveDate: row.drive_date ?? '',
    });
    this.revealForm();
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  async save(): Promise<void> {
    if (this.isSaving()) return;

    const title = this.form.controls.title.value.trim();
    const body = this.form.controls.body.value.trim();

    if (!title || !body) {
      this.form.markAllAsTouched();
      this.toast.error('Title and body are required.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }

    const driveDate = this.form.controls.driveDate.value.trim() || null;

    this.isSaving.set(true);
    try {
      const id = this.editingId();
      if (id) {
        await this.announcementsService.updateAnnouncement(id, {
          title,
          body,
          drive_date: driveDate,
        });
        this.toast.success('Announcement updated.');
      } else {
        await this.announcementsService.createAnnouncement({
          title,
          body,
          drive_date: driveDate,
        });
        this.toast.success('Draft announcement created.');
      }
      this.closeForm();
      await this.load();
    } catch (error: unknown) {
      this.toast.error(
        error instanceof Error ? error.message : 'Could not save announcement.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  async publish(row: CrtAnnouncement): Promise<void> {
    if (this.actionId()) return;
    this.actionId.set(row.id);
    try {
      await this.announcementsService.publishAnnouncement(row.id);
      this.toast.success('Announcement published.');
      await this.load();
    } catch (error: unknown) {
      this.toast.error(
        error instanceof Error ? error.message : 'Could not publish announcement.',
      );
    } finally {
      this.actionId.set(null);
    }
  }

  async unpublish(row: CrtAnnouncement): Promise<void> {
    if (this.actionId()) return;
    this.actionId.set(row.id);
    try {
      await this.announcementsService.unpublishAnnouncement(row.id);
      this.toast.success('Announcement unpublished.');
      await this.load();
    } catch (error: unknown) {
      this.toast.error(
        error instanceof Error ? error.message : 'Could not unpublish announcement.',
      );
    } finally {
      this.actionId.set(null);
    }
  }

  async remove(row: CrtAnnouncement): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete announcement',
      message: `Delete "${row.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    if (this.actionId()) return;
    this.actionId.set(row.id);
    try {
      await this.announcementsService.deleteAnnouncement(row.id);
      this.toast.success('Announcement deleted.');
      if (this.editingId() === row.id) {
        this.closeForm();
      }
      await this.load();
    } catch (error: unknown) {
      this.toast.error(
        error instanceof Error ? error.message : 'Could not delete announcement.',
      );
    } finally {
      this.actionId.set(null);
    }
  }

  isRowBusy(id: string): boolean {
    return this.actionId() === id;
  }

  private revealForm(): void {
    this.showForm.set(true);
    const timer = setTimeout(() => {
      this.formHost()?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }
}
