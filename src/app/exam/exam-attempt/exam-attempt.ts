import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast';
import { ExamService } from '../services/exam.service';
import { ExamProctoringService } from '../services/exam-proctoring.service';
import type {
  ExamAttempt as ExamAttemptRecord,
  ExamCodingPayload,
  ExamMcqPayload,
  ExamQuestion
} from '../../models/index';

@Component({
  selector: 'app-exam-attempt',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './exam-attempt.html',
  styleUrl: './exam-attempt.scss'
})
export class ExamAttemptPage implements OnInit, OnDestroy {
  @ViewChild('attemptShell') attemptShell?: ElementRef<HTMLElement>;
  @ViewChild('proctorVideo') proctorVideo?: ElementRef<HTMLVideoElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly examService = inject(ExamService);
  private readonly proctoring = inject(ExamProctoringService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly runningTests = signal(false);
  readonly testResults = signal<Array<{ input: string; expectedOutput: string; passed: boolean }>>([]);
  readonly attempt = signal<ExamAttemptRecord | null>(null);
  readonly questions = signal<ExamQuestion[]>([]);
  readonly currentIndex = signal(0);
  readonly remainingSeconds = signal(0);
  readonly fullscreenWarnings = signal(0);

  readonly currentQuestion = computed(() => {
    const list = this.questions();
    const idx = this.currentIndex();
    return list[idx] ?? null;
  });

  mcqSelections: Record<string, number> = {};
  codingAnswers: Record<string, string> = {};

  private examId = '';
  private attemptId = '';
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private unbindFullscreen: (() => void) | null = null;
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  ngOnInit(): void {
    this.examId = this.route.snapshot.paramMap.get('examId') ?? '';
    this.attemptId = this.route.snapshot.paramMap.get('attemptId') ?? '';
    void this.initAttempt();
  }

  ngOnDestroy(): void {
    if (this.timerHandle) clearInterval(this.timerHandle);
    this.unbindFullscreen?.();
    this.proctoring.stopMedia();
    for (const t of this.saveTimers.values()) clearTimeout(t);
  }

  private async initAttempt(): Promise<void> {
    try {
      const userId = this.auth.currentUser()?.id;
      if (!userId) {
        await this.router.navigate(['/exam/login']);
        return;
      }

      const attempt = await this.examService.getAttempt(this.attemptId);
      if (!attempt || attempt.userId !== userId || attempt.examId !== this.examId) {
        this.toast.error('Invalid exam attempt.');
        await this.router.navigate(['/exam/dashboard']);
        return;
      }

      if (attempt.status !== 'in_progress') {
        await this.router.navigate(['/exam/dashboard']);
        return;
      }

      this.attempt.set(attempt);
      this.fullscreenWarnings.set(attempt.fullscreenExitCount);
      this.questions.set(await this.examService.getQuestionsForRole(attempt.examRoleId));

      const saved = await this.examService.loadAnswers(this.attemptId);
      for (const [questionId, answer] of Object.entries(saved)) {
        if (typeof answer['selectedIndex'] === 'number') {
          this.mcqSelections[questionId] = answer['selectedIndex'] as number;
        }
        if (typeof answer['code'] === 'string') {
          this.codingAnswers[questionId] = answer['code'] as string;
        }
      }

      for (const q of this.questions()) {
        if (q.type === 'coding' && !this.codingAnswers[q.id]) {
          const payload = q.payload as ExamCodingPayload;
          this.codingAnswers[q.id] = payload.starterCode ?? '';
        }
      }

      const media = await this.proctoring.requestMedia();
      if (!media) {
        this.toast.error('Camera/microphone required.');
        await this.router.navigate(['/exam', this.examId, 'start']);
        return;
      }

      setTimeout(() => {
        if (this.proctorVideo?.nativeElement) {
          this.proctoring.attachPreview(this.proctorVideo.nativeElement);
        }
        if (this.attemptShell?.nativeElement) {
          void this.proctoring.enterFullscreen(this.attemptShell.nativeElement);
        }
      }, 100);

      this.unbindFullscreen = this.proctoring.bindFullscreenWarnings(
        this.attemptId,
        (count) => this.fullscreenWarnings.set(count)
      );

      this.proctoring.startSnapshotLoop(userId, this.attemptId);
      this.startTimer(new Date(attempt.endsAt).getTime());
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not load exam');
      await this.router.navigate(['/exam/dashboard']);
    } finally {
      this.loading.set(false);
    }
  }

  private startTimer(endsAtMs: number): void {
    const tick = (): void => {
      const remaining = Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000));
      this.remainingSeconds.set(remaining);
      if (remaining <= 0) {
        void this.autoSubmit();
      }
    };

    tick();
    this.timerHandle = setInterval(tick, 1000);
  }

  formatTime(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  asMcq(payload: ExamMcqPayload | ExamCodingPayload): ExamMcqPayload {
    return payload as ExamMcqPayload;
  }

  asCoding(payload: ExamMcqPayload | ExamCodingPayload): ExamCodingPayload {
    return payload as ExamCodingPayload;
  }

  selectMcq(questionId: string, optionIndex: number): void {
    this.mcqSelections[questionId] = optionIndex;
    this.scheduleSave(questionId, { selectedIndex: optionIndex });
  }

  onCodingInput(questionId: string, value: string): void {
    this.codingAnswers[questionId] = value;
    this.scheduleSave(questionId, { code: value });
    this.testResults.set([]);
  }

  async runPublicTests(questionId: string): Promise<void> {
    const code = this.codingAnswers[questionId] ?? '';
    if (!code.trim()) {
      this.toast.error('Write some code before running tests.');
      return;
    }

    this.runningTests.set(true);
    try {
      const result = await this.examService.runPublicTests(this.attemptId, questionId, code);
      this.testResults.set(result.results);
      this.toast.info(`${result.passedCount}/${result.total} public tests passed`);
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not run tests');
    } finally {
      this.runningTests.set(false);
    }
  }

  private scheduleSave(questionId: string, answer: Record<string, unknown>): void {
    const existing = this.saveTimers.get(questionId);
    if (existing) clearTimeout(existing);

    this.saveTimers.set(
      questionId,
      setTimeout(() => {
        void this.examService.saveAnswer(this.attemptId, questionId, answer);
      }, 400)
    );
  }

  goTo(index: number): void {
    if (index >= 0 && index < this.questions().length) {
      this.currentIndex.set(index);
    }
  }

  async submitExam(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.examService.submitAttempt(this.attemptId, false);
      this.toast.success('Exam submitted successfully.');
      await this.router.navigate(['/exam/dashboard']);
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      this.submitting.set(false);
    }
  }

  private async autoSubmit(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }

    try {
      await this.examService.submitAttempt(this.attemptId, true);
      this.toast.info('Time is up. Your exam was auto-submitted.');
      await this.router.navigate(['/exam/dashboard']);
    } catch {
      this.toast.error('Auto-submit failed. Contact support.');
    }
  }
}
