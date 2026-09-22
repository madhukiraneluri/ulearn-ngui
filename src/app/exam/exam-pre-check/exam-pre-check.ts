import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast';
import { ExamService } from '../services/exam.service';
import { ExamProctoringService } from '../services/exam-proctoring.service';
import { isMobileExamDevice } from '../utils/exam-device.util';
import type { ExamCandidate } from '../../models/index';

@Component({
  selector: 'app-exam-pre-check',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './exam-pre-check.html',
  styleUrl: './exam-pre-check.scss'
})
export class ExamPreCheck implements OnInit, OnDestroy {
  private readonly previewVideo = viewChild<ElementRef<HTMLVideoElement>>('previewVideo');

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly examService = inject(ExamService);
  private readonly proctoring = inject(ExamProctoringService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly starting = signal(false);
  readonly assignment = signal<ExamCandidate | null>(null);
  readonly consent = signal(false);
  readonly mediaOk = signal(false);
  readonly isMobile = signal(isMobileExamDevice());

  private examId = '';

  constructor() {
    effect(() => {
      if (this.loading() || !this.mediaOk() || this.isMobile()) return;

      const video = this.previewVideo()?.nativeElement;
      if (video) {
        this.proctoring.attachPreview(video);
      }
    });
  }

  ngOnInit(): void {
    this.examId = this.route.snapshot.paramMap.get('examId') ?? '';
    void this.load();
  }

  ngOnDestroy(): void {
    this.proctoring.stopMedia();
  }

  private async load(): Promise<void> {
    try {
      const userId = this.auth.currentUser()?.id;
      if (!userId) {
        await this.router.navigate(['/exam/login']);
        return;
      }

      const assignment = await this.examService.getMyAssignment(userId, this.examId);
      if (!assignment?.exam) {
        this.toast.error('You are not registered for this exam.');
        await this.router.navigate(['/exam/dashboard']);
        return;
      }

      const active = await this.examService.getActiveAttempt(userId, this.examId);
      if (active) {
        await this.router.navigate(['/exam', this.examId, 'attempt', active.id]);
        return;
      }

      this.assignment.set(assignment);

      if (!this.isMobile()) {
        const media = await this.proctoring.requestMedia();
        this.mediaOk.set(media);
      }
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not load exam');
    } finally {
      this.loading.set(false);
    }
  }

  toggleConsent(event: Event): void {
    this.consent.set((event.target as HTMLInputElement).checked);
  }

  async beginExam(): Promise<void> {
    if (this.isMobile()) {
      this.toast.error('Mobile screen is not allowed. Please use a laptop or PC to write this exam.');
      return;
    }

    if (!this.consent() || !this.mediaOk()) {
      this.toast.error('Accept proctoring consent and allow camera/microphone.');
      return;
    }

    this.starting.set(true);
    try {
      await this.proctoring.enterFullscreen(document.documentElement);
      const result = await this.examService.startExam(this.examId);
      await this.examService.recordProctoringConsent(result.attemptId);
      await this.router.navigate(['/exam', this.examId, 'attempt', result.attemptId]);
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not start exam');
    } finally {
      this.starting.set(false);
    }
  }
}
