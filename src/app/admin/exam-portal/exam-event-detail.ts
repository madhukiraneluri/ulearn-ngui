import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ExamRegistrations } from '../exam-registrations/exam-registrations';
import { AdminExamsService } from '../services/admin-exams.service';
import {
  ExamEvent,
  ExamEventStatus,
  ExamEventsService,
  examEventLabel
} from '../services/exam-events.service';
import { ToastService } from '../../core/services/toast';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import type { Exam } from '../../models/index';

@Component({
  selector: 'app-exam-event-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe, ExamRegistrations],
  templateUrl: './exam-event-detail.html',
  styleUrl: './exam-event-detail.scss'
})
export class ExamEventDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly eventsService = inject(ExamEventsService);
  private readonly examsService = inject(AdminExamsService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly event = signal<ExamEvent | null>(null);
  readonly papers = signal<Exam[]>([]);
  readonly saving = signal(false);
  readonly label = examEventLabel;
  readonly statuses: ExamEventStatus[] = ['draft', 'active', 'completed'];

  roleName = '';
  roleDuration = 60;
  roleHasCoding = false;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('eventId');
    if (!id) return;
    try {
      this.event.set(await this.eventsService.getEvent(id));
      const exams = await this.examsService.listExams();
      this.papers.set(exams.filter((exam) => exam.eventId === id));
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not load exam');
    }
  }

  async setStatus(status: ExamEventStatus): Promise<void> {
    const event = this.event();
    if (!event || event.status === status) return;
    if (status === 'active') {
      const ok = await this.confirmDialog.confirm({
        title: 'Make this exam active?',
        message: 'Students enrolled here will see only the exam dashboard until you mark it completed.',
        confirmLabel: 'Make active'
      });
      if (!ok) return;
    }
    if (status === 'completed') {
      const ok = await this.confirmDialog.confirm({
        title: 'Mark this exam completed?',
        message: 'Enrolled students return to the ULearn portal.',
        confirmLabel: 'Mark completed'
      });
      if (!ok) return;
    }
    this.saving.set(true);
    try {
      await this.eventsService.setStatus(event.id, status);
      this.toast.success(`Exam is ${status}`);
      await this.reload();
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not update status');
    } finally {
      this.saving.set(false);
    }
  }

  async addRole(): Promise<void> {
    const event = this.event();
    if (!event || !this.roleName.trim()) {
      this.toast.error('Enter a role name');
      return;
    }
    this.saving.set(true);
    try {
      await this.eventsService.addRole(event.id, this.roleName, this.roleHasCoding, Number(this.roleDuration) || 60);
      this.roleName = '';
      this.roleHasCoding = false;
      this.roleDuration = 60;
      this.toast.success('Role added');
      await this.reload();
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not add role');
    } finally {
      this.saving.set(false);
    }
  }
}
