import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AdminSessionsService,
  AdminSessionRow,
  SessionUpsertInput
} from '../services/admin-sessions.service';
import { AdminBatchesService, AdminBatchRow } from '../services/admin-batches.service';
import { ToastService } from '../../core/services/toast';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import type { LiveSessionStatus, SessionStudentPermission } from '../../models';

@Component({
  selector: 'app-sessions-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './sessions-management.html',
  styleUrl: './sessions-management.scss'
})
export class SessionsManagement implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sessionsService = inject(AdminSessionsService);
  private readonly batchesService = inject(AdminBatchesService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly sessions = signal<AdminSessionRow[]>([]);
  readonly batches = signal<AdminBatchRow[]>([]);
  readonly isLoading = signal(true);
  readonly showForm = signal(false);
  readonly isSaving = signal(false);
  readonly filterStatus = signal<'all' | LiveSessionStatus>('all');

  readonly formBatchId = signal('');
  readonly formTitle = signal('');
  readonly formDescription = signal('');
  readonly formScheduledAt = signal('');
  readonly formDuration = signal(90);
  readonly formMaxParticipants = signal<number | null>(null);
  readonly formPermission = signal<SessionStudentPermission>('audio_video');
  readonly formAllowGuestJoin = signal(false);
  readonly formIsolateStudents = signal(false);

  readonly filteredSessions = signal<AdminSessionRow[]>([]);

  ngOnInit(): void {
    void this.load().then(() => {
      const batchId = this.route.snapshot.queryParamMap.get('batchId');
      if (batchId) {
        this.openCreate(batchId);
      }
    });
  }

  private async load(): Promise<void> {
    this.isLoading.set(true);
    const [sessions, batches] = await Promise.all([
      this.sessionsService.listAll(),
      this.batchesService.listAll()
    ]);
    this.sessions.set(sessions);
    this.batches.set(batches);
    this.applyFilter();
    this.isLoading.set(false);
  }

  setFilter(status: 'all' | LiveSessionStatus): void {
    this.filterStatus.set(status);
    this.applyFilter();
  }

  private applyFilter(): void {
    const status = this.filterStatus();
    const list = this.sessions();
    this.filteredSessions.set(
      status === 'all' ? list : list.filter((s) => s.status === status)
    );
  }

  openCreate(batchId = ''): void {
    this.formBatchId.set(batchId || this.batches()[0]?.id || '');
    this.formTitle.set('');
    this.formDescription.set('');
    this.formScheduledAt.set('');
    this.formDuration.set(90);
    this.formMaxParticipants.set(null);
    this.formPermission.set('audio_video');
    this.formAllowGuestJoin.set(false);
    this.formIsolateStudents.set(false);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
  }

  setPermission(permission: SessionStudentPermission): void {
    this.formPermission.set(permission);
  }

  openSession(session: AdminSessionRow): void {
    void this.router.navigate(['/admin/sessions', session.id]);
  }

  async save(): Promise<void> {
    const batchId = this.formBatchId();
    const title = this.formTitle().trim();
    const scheduledAt = this.formScheduledAt();

    if (!batchId) {
      this.toast.error('Select a batch');
      return;
    }
    if (!title) {
      this.toast.error('Title is required');
      return;
    }
    if (!scheduledAt) {
      this.toast.error('Schedule date and time is required');
      return;
    }

    this.isSaving.set(true);
    try {
      const input: SessionUpsertInput = {
        batchId,
        title,
        description: this.formDescription().trim() || null,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMinutes: this.formDuration(),
        maxParticipants: this.formMaxParticipants(),
        defaultStudentPermission: this.formPermission(),
        allowGuestJoin: this.formAllowGuestJoin(),
        isolateStudents: this.formIsolateStudents()
      };

      const created = await this.sessionsService.create(input);
      if (!created) throw new Error('Could not create session');

      this.toast.success('Session scheduled');
      this.closeForm();
      await this.load();
      void this.router.navigate(['/admin/sessions', created.id]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteSession(session: AdminSessionRow): Promise<void> {
    if (
      !(await this.confirmDialog.confirm({
        title: 'Delete session',
        message: `Delete session "${session.title}"?`,
        confirmLabel: 'Delete',
        variant: 'danger'
      }))
    ) {
      return;
    }

    const ok = await this.sessionsService.delete(session.id);
    if (ok) {
      this.toast.success('Session deleted');
      await this.load();
    } else {
      this.toast.error('Could not delete session');
    }
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return iso;
    }
  }
}
