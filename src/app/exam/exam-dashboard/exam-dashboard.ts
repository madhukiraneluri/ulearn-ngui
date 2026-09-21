import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ExamService } from '../services/exam.service';
import { ExamRegistrationService } from '../../admin/services/exam-registration.service';
import type { ExamCandidate, ExamResultRow } from '../../models/index';

@Component({
  selector: 'app-exam-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './exam-dashboard.html',
  styleUrl: './exam-dashboard.scss'
})
export class ExamDashboard implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly examService = inject(ExamService);
  private readonly resultsService = inject(ExamRegistrationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly assignments = signal<ExamCandidate[]>([]);
  readonly results = signal<Record<string, ExamResultRow | null>>({});
  readonly now = signal(Date.now());

  readonly hasUpcomingExam = computed(() =>
    this.assignments().some((item) => this.isBeforeStart(item))
  );

  ngOnInit(): void {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));

    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const userId = this.auth.currentUser()?.id;
      if (!userId) {
        this.error.set('Not signed in');
        return;
      }
      const rows = await this.examService.listMyExams(userId);
      this.assignments.set(rows);

      const resultMap: Record<string, ExamResultRow | null> = {};
      for (const row of rows) {
        resultMap[row.examId] = await this.resultsService.getMyResult(userId, row.examId);
      }
      this.results.set(resultMap);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not load exams');
    } finally {
      this.loading.set(false);
    }
  }

  examStatusLabel(candidate: ExamCandidate): string {
    const exam = candidate.exam;
    if (!exam) return 'Unknown';
    const now = this.now();
    const start = new Date(exam.startsAt).getTime();
    const end = new Date(exam.endsAt).getTime();
    if (now < start) return 'Scheduled';
    if (now > end) return 'Closed';
    return 'Open';
  }

  isBeforeStart(candidate: ExamCandidate): boolean {
    const exam = candidate.exam;
    if (!exam) return false;
    return this.now() < new Date(exam.startsAt).getTime();
  }

  isAfterEnd(candidate: ExamCandidate): boolean {
    const exam = candidate.exam;
    if (!exam) return false;
    return this.now() > new Date(exam.endsAt).getTime();
  }

  countdownFor(candidate: ExamCandidate): string {
    const exam = candidate.exam;
    if (!exam) return '--:--:--';
    const diff = new Date(exam.startsAt).getTime() - this.now();
    if (diff <= 0) return '00:00:00';
    return formatCountdown(diff);
  }

  canStart(candidate: ExamCandidate): boolean {
    const exam = candidate.exam;
    if (!exam || exam.status !== 'published') return false;
    const now = this.now();
    return (
      now >= new Date(exam.startsAt).getTime() &&
      now <= new Date(exam.endsAt).getTime()
    );
  }
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}
