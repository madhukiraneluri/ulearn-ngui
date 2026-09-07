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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AdminSessionsService,
  SessionUpsertInput
} from '../services/admin-sessions.service';
import { AdminBatchesService, AdminBatchRow } from '../services/admin-batches.service';
import { ToastService } from '../../core/services/toast';
import type { SessionPlace, SessionStudentPermission, SessionType } from '../../models';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const DURATION_OPTIONS = [30, 45, 60, 90, 120];
const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata - +05:30' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai - +04:00' },
  { value: 'Europe/London', label: 'Europe/London - +00:00' },
  { value: 'America/New_York', label: 'America/New_York - -05:00' },
  { value: 'UTC', label: 'UTC - +00:00' }
];

@Component({
  selector: 'app-schedule-session',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './schedule-session.html',
  styleUrl: './schedule-session.scss'
})
export class ScheduleSession implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sessionsService = inject(AdminSessionsService);
  private readonly batchesService = inject(AdminBatchesService);
  private readonly toast = inject(ToastService);

  readonly weekdays = WEEKDAYS;
  readonly durationOptions = DURATION_OPTIONS;
  readonly timezoneOptions = TIMEZONE_OPTIONS;

  readonly batches = signal<AdminBatchRow[]>([]);
  readonly hosts = signal<{ id: string; name: string; email: string | null }[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);

  readonly formTitle = signal('');
  readonly showDescription = signal(false);
  readonly formDescription = signal('');
  readonly formSessionType = signal<SessionType>('one_time');
  readonly formStartDate = signal('');
  readonly formStartTime = signal('');
  readonly formDuration = signal(60);
  readonly formTimezone = signal('Asia/Kolkata');
  readonly formRepeatEnabled = signal(false);
  readonly formRepeatDays = signal<boolean[]>([false, false, false, false, false, false, false]);
  readonly formRecurrenceEndDate = signal('');
  readonly formSessionPlace = signal<SessionPlace>('virtual');
  readonly formMaxParticipants = signal<number | null>(null);
  readonly formPermission = signal<SessionStudentPermission>('audio_video');
  readonly formAllowGuestJoin = signal(true);
  readonly formIsolateStudents = signal(false);
  readonly formHostUserId = signal('');
  readonly selectedBatchIds = signal<string[]>([]);

  readonly showSettingsPanel = signal(false);
  readonly showBatchPicker = signal(false);

  readonly assignedBatches = computed(() => {
    const ids = new Set(this.selectedBatchIds());
    return this.batches().filter((batch) => ids.has(batch.id));
  });

  readonly sessionTypeHint = computed(() =>
    this.formSessionType() === 'permanent'
      ? 'Permanent session can be used for a series of live sessions. Link for the room will remain the same.'
      : 'One-time session will generate an exclusive link for a particular session. Next session will require another link.'
  );

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.isLoading.set(true);
    const [batches, hosts] = await Promise.all([
      this.batchesService.listAll(),
      this.sessionsService.listHostCandidates()
    ]);
    this.batches.set(batches);
    this.hosts.set(hosts);

    const now = new Date();
    this.formStartDate.set(this.toDateInput(now));
    this.formStartTime.set(this.toTimeInput(now));
    this.formRecurrenceEndDate.set(this.toDateInput(this.addYears(now, 1)));

    const batchId = this.route.snapshot.queryParamMap.get('batchId');
    if (batchId && batches.some((batch) => batch.id === batchId)) {
      this.selectedBatchIds.set([batchId]);
    }

    if (hosts.length === 1) {
      this.formHostUserId.set(hosts[0].id);
    }

    this.isLoading.set(false);
  }

  toggleDescription(): void {
    this.showDescription.update((value) => !value);
  }

  setSessionType(type: SessionType): void {
    this.formSessionType.set(type);
    if (type === 'permanent') {
      this.formRepeatEnabled.set(true);
    }
  }

  setSessionPlace(place: SessionPlace): void {
    this.formSessionPlace.set(place);
  }

  setPermission(permission: SessionStudentPermission): void {
    this.formPermission.set(permission);
  }

  toggleRepeatDay(index: number): void {
    this.formRepeatDays.update((days) => {
      const next = [...days];
      next[index] = !next[index];
      return next;
    });
  }

  toggleBatchPicker(): void {
    this.showBatchPicker.update((value) => !value);
  }

  isBatchSelected(batchId: string): boolean {
    return this.selectedBatchIds().includes(batchId);
  }

  toggleBatch(batchId: string): void {
    this.selectedBatchIds.update((ids) =>
      ids.includes(batchId) ? ids.filter((id) => id !== batchId) : [...ids, batchId]
    );
  }

  removeBatch(batchId: string): void {
    this.selectedBatchIds.update((ids) => ids.filter((id) => id !== batchId));
  }

  async save(): Promise<void> {
    const title = this.formTitle().trim();
    const startDate = this.formStartDate();
    const startTime = this.formStartTime();
    const batchIds = this.selectedBatchIds();
    const hostUserId = this.formHostUserId();

    if (!title) {
      this.toast.error('Session title is required');
      return;
    }
    if (title.length > 70) {
      this.toast.error('Session title must be 70 characters or fewer');
      return;
    }
    if (!startDate || !startTime) {
      this.toast.error('Start date and time are required');
      return;
    }
    if (batchIds.length === 0) {
      this.toast.error('Assign at least one batch');
      return;
    }
    if (!hostUserId) {
      this.toast.error('Select an instructor for this session');
      return;
    }

    const occurrences = this.buildOccurrences(startDate, startTime);
    if (occurrences.length === 0) {
      this.toast.error('Select at least one recurrence day for the series');
      return;
    }

    this.isSaving.set(true);
    try {
      const sessionType = this.formSessionType();
      const firstOccurrence = occurrences[0];
      const inputs: SessionUpsertInput[] = [];

      for (const batchId of batchIds) {
        inputs.push({
          batchId,
          title,
          description: this.formDescription().trim() || null,
          scheduledAt: firstOccurrence,
          durationMinutes: this.formDuration(),
          hostUserId,
          maxParticipants: this.formMaxParticipants(),
          defaultStudentPermission: this.formPermission(),
          allowGuestJoin: this.formAllowGuestJoin(),
          isolateStudents: this.formIsolateStudents(),
          sessionType,
          sessionPlace: this.formSessionPlace(),
          timezone: this.formTimezone(),
          recurrenceConfig:
            sessionType === 'permanent' && this.formRepeatEnabled()
              ? {
                  enabled: true,
                  repeatDays: this.formRepeatDays(),
                  endDate: this.formRecurrenceEndDate()
                }
              : null
        });
      }

      const { created, errors } = await this.sessionsService.createMany(inputs);
      if (created.length === 0) {
        throw new Error(errors[0] ?? 'Could not create session');
      }

      if (errors.length > 0) {
        this.toast.error(`${created.length} scheduled, ${errors.length} failed`);
      } else {
        this.toast.success(
          created.length === 1
            ? 'Session scheduled'
            : `${created.length} sessions scheduled`
        );
      }

      void this.router.navigate(['/admin/sessions', created[0].id]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
    }
  }

  private buildOccurrences(startDate: string, startTime: string): string[] {
    const base = new Date(`${startDate}T${startTime}`);
    if (Number.isNaN(base.getTime())) return [];

    if (this.formSessionType() !== 'permanent' || !this.formRepeatEnabled()) {
      return [base.toISOString()];
    }

    const repeatDays = this.formRepeatDays();
    const endDateRaw = this.formRecurrenceEndDate();
    if (!repeatDays.some(Boolean)) return [];
    if (!endDateRaw) return [base.toISOString()];

    const endDate = new Date(`${endDateRaw}T23:59:59`);
    const occurrences: string[] = [];
    const cursor = new Date(base);
    cursor.setHours(base.getHours(), base.getMinutes(), 0, 0);

    while (cursor <= endDate) {
      if (repeatDays[cursor.getDay()]) {
        occurrences.push(new Date(cursor).toISOString());
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return occurrences.length ? occurrences : [base.toISOString()];
  }

  private toDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toTimeInput(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private addYears(date: Date, years: number): Date {
    const next = new Date(date);
    next.setFullYear(next.getFullYear() + years);
    return next;
  }
}
