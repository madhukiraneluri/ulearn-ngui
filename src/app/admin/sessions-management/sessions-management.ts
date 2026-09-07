import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AdminSessionsService, AdminSessionRow } from '../services/admin-sessions.service';
import { ToastService } from '../../core/services/toast';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import type { LiveSessionStatus } from '../../models';

@Component({
  selector: 'app-sessions-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './sessions-management.html',
  styleUrl: './sessions-management.scss'
})
export class SessionsManagement implements OnInit {
  private readonly router = inject(Router);
  private readonly sessionsService = inject(AdminSessionsService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly sessions = signal<AdminSessionRow[]>([]);
  readonly isLoading = signal(true);
  readonly filterStatus = signal<'all' | LiveSessionStatus>('all');
  readonly filteredSessions = signal<AdminSessionRow[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.isLoading.set(true);
    const sessions = await this.sessionsService.listAll();
    this.sessions.set(sessions);
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

  openCreate(): void {
    void this.router.navigate(['/admin/sessions/schedule']);
  }

  openSession(session: AdminSessionRow): void {
    void this.router.navigate(['/admin/sessions', session.id]);
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
