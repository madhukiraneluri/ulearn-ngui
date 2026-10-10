import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminBatchesService } from '../services/admin-batches.service';
import {
  ExamEvent,
  ExamEventsService,
  examEventLabel
} from '../services/exam-events.service';
import { ToastService } from '../../core/services/toast';

@Component({
  selector: 'app-exam-portal-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './exam-portal-list.html',
  styleUrl: './exam-portal-list.scss'
})
export class ExamPortalList implements OnInit {
  private readonly eventsService = inject(ExamEventsService);
  private readonly batchesService = inject(AdminBatchesService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly events = signal<ExamEvent[]>([]);
  readonly batches = signal<{ id: string; name: string }[]>([]);
  readonly showForm = signal(false);
  readonly label = examEventLabel;

  kind: 'college' | 'batch' = 'college';
  collegeName = '';
  batchId = '';
  batchTitle = '';
  startsAt = '';
  endsAt = '';

  async ngOnInit(): Promise<void> {
    await this.reload();
    try {
      const batches = await this.batchesService.listAll();
      this.batches.set(batches.map((batch) => ({ id: batch.id, name: batch.name })));
    } catch {
      this.batches.set([]);
    }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.events.set(await this.eventsService.listEvents());
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not load exams');
    } finally {
      this.loading.set(false);
    }
  }

  open(event: ExamEvent): void {
    void this.router.navigate(['/admin/exam-portal', event.id]);
  }

  async create(): Promise<void> {
    if (this.kind === 'college' && !this.collegeName.trim()) {
      this.toast.error('Enter the college name');
      return;
    }
    if (this.kind === 'batch' && !this.batchId) {
      this.toast.error('Select a batch');
      return;
    }
    if (!this.startsAt || !this.endsAt) {
      this.toast.error('Enter a start and end time');
      return;
    }
    const starts = new Date(this.startsAt);
    const ends = new Date(this.endsAt);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
      this.toast.error('End time must be after the start time');
      return;
    }

    this.saving.set(true);
    try {
      const id = this.kind === 'college'
        ? await this.eventsService.createCollegeExam(this.collegeName, starts.toISOString(), ends.toISOString())
        : await this.eventsService.createBatchExam(
          this.batchId,
          this.batchTitle.trim() || this.batches().find((batch) => batch.id === this.batchId)?.name || '',
          starts.toISOString(),
          ends.toISOString()
        );
      this.toast.success('Exam created as draft');
      await this.router.navigate(['/admin/exam-portal', id]);
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not create exam');
    } finally {
      this.saving.set(false);
    }
  }
}
