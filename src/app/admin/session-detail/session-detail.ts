import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AdminSessionsService,
  AdminSessionRow,
  SessionInviteLink
} from '../services/admin-sessions.service';
import { ToastService } from '../../core/services/toast';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import type { LiveSessionStatus } from '../../models';

@Component({
  selector: 'app-session-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './session-detail.html',
  styleUrl: './session-detail.scss'
})
export class SessionDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sessionsService = inject(AdminSessionsService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly session = signal<AdminSessionRow | null>(null);
  readonly inviteLinks = signal<SessionInviteLink[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isRegenerating = signal(false);

  readonly editTitle = signal('');
  readonly editDescription = signal('');
  readonly editScheduledAt = signal('');
  readonly editDuration = signal(90);

  ngOnInit(): void {
    void this.load();
  }

  private sessionId(): string {
    return this.route.snapshot.paramMap.get('sessionId') ?? '';
  }

  private async load(): Promise<void> {
    const id = this.sessionId();
    if (!id) {
      await this.router.navigate(['/admin/sessions']);
      return;
    }

    this.isLoading.set(true);
    try {
      const [session, links] = await Promise.all([
        this.sessionsService.getById(id),
        this.sessionsService.getInviteLinks(id)
      ]);

      if (!session) {
        this.toast.error('Session not found');
        await this.router.navigate(['/admin/sessions']);
        return;
      }

      this.session.set(session);
      this.inviteLinks.set(links);
      this.editTitle.set(session.title);
      this.editDescription.set(session.description ?? '');
      this.editScheduledAt.set(this.toDatetimeLocal(session.scheduledAt));
      this.editDuration.set(session.durationMinutes);
    } finally {
      this.isLoading.set(false);
    }
  }

  private toDatetimeLocal(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  roleLabel(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  async copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.toast.success('Link copied');
    } catch {
      this.toast.error('Could not copy link');
    }
  }

  async saveDetails(): Promise<void> {
    const session = this.session();
    if (!session || this.isSaving()) return;

    const title = this.editTitle().trim();
    if (!title) {
      this.toast.error('Title is required');
      return;
    }

    this.isSaving.set(true);
    try {
      const ok = await this.sessionsService.update(session.id, {
        title,
        description: this.editDescription().trim() || null,
        scheduledAt: new Date(this.editScheduledAt()).toISOString(),
        durationMinutes: this.editDuration()
      });

      if (!ok) throw new Error('Could not update session');
      this.toast.success('Session updated');
      await this.load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
    }
  }

  async setStatus(status: LiveSessionStatus): Promise<void> {
    const session = this.session();
    if (!session) return;

    const ok = await this.sessionsService.update(session.id, { status });
    if (ok) {
      this.toast.success(`Session marked ${status}`);
      await this.load();
    } else {
      this.toast.error('Could not update status');
    }
  }

  async regenerateLinks(): Promise<void> {
    const session = this.session();
    if (!session || this.isRegenerating()) return;

    if (
      !(await this.confirmDialog.confirm({
        title: 'Regenerate links',
        message: 'Old join links will stop working. Continue?',
        confirmLabel: 'Regenerate',
        variant: 'danger'
      }))
    ) {
      return;
    }

    this.isRegenerating.set(true);
    try {
      const links = await this.sessionsService.regenerateInvites(session.id);
      this.inviteLinks.set(links);
      this.toast.success('New links generated');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Regenerate failed';
      this.toast.error(msg);
    } finally {
      this.isRegenerating.set(false);
    }
  }

  async deleteSession(): Promise<void> {
    const session = this.session();
    if (!session) return;

    if (
      !(await this.confirmDialog.confirm({
        title: 'Delete session',
        message: `Delete "${session.title}"?`,
        confirmLabel: 'Delete',
        variant: 'danger'
      }))
    ) {
      return;
    }

    const ok = await this.sessionsService.delete(session.id);
    if (ok) {
      this.toast.success('Session deleted');
      await this.router.navigate(['/admin/sessions']);
    } else {
      this.toast.error('Could not delete session');
    }
  }

  openJoin(url: string): void {
    window.open(url, '_blank', 'noopener');
  }
}
