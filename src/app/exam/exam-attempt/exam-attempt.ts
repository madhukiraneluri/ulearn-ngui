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
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { ToastService } from '../../core/services/toast';
import { ExamService } from '../services/exam.service';
import { ExamProctoringService } from '../services/exam-proctoring.service';
import { isMobileExamDevice } from '../utils/exam-device.util';
import {
  DEFAULT_EXAM_CODING_LANGUAGE,
  EXAM_CODING_LANGUAGES
} from '../exam-coding-languages.config';
import type { ExamPublicTestResult } from '../models/exam-test-result.model';
import type {
  ExamAttempt as ExamAttemptRecord,
  ExamCodingPayload,
  ExamMcqPayload,
  ExamQuestion
} from '../../models/index';

const SUBMIT_LOCK_SECONDS = 20 * 60;

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
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly codingLanguages = EXAM_CODING_LANGUAGES;
  readonly loading = signal(true);
  readonly fullscreenGateOpen = signal(false);
  readonly submitting = signal(false);
  readonly submittingCode = signal(false);
  readonly runningTests = signal(false);
  readonly testResults = signal<ExamPublicTestResult[]>([]);
  readonly attempt = signal<ExamAttemptRecord | null>(null);
  readonly questions = signal<ExamQuestion[]>([]);
  readonly currentIndex = signal(0);
  readonly remainingSeconds = signal(0);
  readonly submitLockSeconds = signal(SUBMIT_LOCK_SECONDS);
  readonly fullscreenWarnings = signal(0);
  readonly visitedIndices = signal<Set<number>>(new Set([0]));

  readonly currentQuestion = computed(() => {
    const list = this.questions();
    const idx = this.currentIndex();
    return list[idx] ?? null;
  });

  readonly isCodingQuestion = computed(() => this.currentQuestion()?.type === 'coding');

  readonly canSubmitExam = computed(() => this.submitLockSeconds() <= 0 && !this.submitting());

  readonly submitExamLabel = computed(() => {
    const lock = this.submitLockSeconds();
    if (lock > 0) {
      return `Submit (${this.formatTime(lock)})`;
    }
    return this.submitting() ? 'Submitting…' : 'Submit exam';
  });

  readonly questionSummary = computed(() => {
    const list = this.questions();
    const visited = this.visitedIndices();
    let answered = 0;
    let visitedNotAnswered = 0;
    let unanswered = 0;

    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      const isAnswered = this.isQuestionAnswered(q);
      const isVisited = visited.has(i) || this.currentIndex() === i;

      if (isAnswered) {
        answered++;
      } else if (isVisited) {
        visitedNotAnswered++;
      } else {
        unanswered++;
      }
    }

    return { answered, visitedNotAnswered, unanswered, total: list.length };
  });

  mcqSelections: Record<string, number> = {};
  codingAnswers: Record<string, string> = {};
  codingLanguagesByQuestion: Record<string, string> = {};
  codingSubmitted: Record<string, boolean> = {};

  private examId = '';
  private attemptId = '';
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private unbindFullscreen: (() => void) | null = null;
  private unbindFullscreenGate: (() => void) | null = null;
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  ngOnInit(): void {
    this.examId = this.route.snapshot.paramMap.get('examId') ?? '';
    this.attemptId = this.route.snapshot.paramMap.get('attemptId') ?? '';
    void this.initAttempt();
  }

  ngOnDestroy(): void {
    if (this.timerHandle) clearInterval(this.timerHandle);
    this.unbindFullscreen?.();
    this.unbindFullscreenGate?.();
    this.proctoring.stopMedia();
    for (const t of this.saveTimers.values()) clearTimeout(t);
  }

  private async initAttempt(): Promise<void> {
    try {
      if (isMobileExamDevice()) {
        this.toast.error('Mobile screen is not allowed. Please use a laptop or PC to write this exam.');
        await this.router.navigate(['/exam', this.examId, 'start']);
        return;
      }

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
        if (typeof answer['language'] === 'string') {
          this.codingLanguagesByQuestion[questionId] = answer['language'] as string;
        }
        if (answer['submitted'] === true) {
          this.codingSubmitted[questionId] = true;
        }
      }

      for (const q of this.questions()) {
        if (q.type !== 'coding') continue;

        const payload = q.payload as ExamCodingPayload;
        if (!this.codingLanguagesByQuestion[q.id]) {
          const defaultLang = payload.language?.toLowerCase() ?? DEFAULT_EXAM_CODING_LANGUAGE;
          this.codingLanguagesByQuestion[q.id] = this.normalizeLanguage(defaultLang);
        }
        if (this.codingAnswers[q.id] === undefined) {
          this.codingAnswers[q.id] = '';
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
        if (!document.fullscreenElement) {
          this.fullscreenGateOpen.set(true);
        }
      }, 0);

      this.unbindFullscreen = this.proctoring.bindFullscreenWarnings(
        this.attemptId,
        (count) => this.fullscreenWarnings.set(count)
      );

      const onFs = (): void => {
        if (document.fullscreenElement) {
          this.fullscreenGateOpen.set(false);
        }
      };
      document.addEventListener('fullscreenchange', onFs);
      this.unbindFullscreenGate = () => document.removeEventListener('fullscreenchange', onFs);

      this.proctoring.startSnapshotLoop(userId, this.attemptId);
      this.startTimer(new Date(attempt.endsAt).getTime(), new Date(attempt.startedAt).getTime());
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not load exam');
      await this.router.navigate(['/exam/dashboard']);
    } finally {
      this.loading.set(false);
    }
  }

  private startTimer(endsAtMs: number, startedAtMs: number): void {
    const tick = (): void => {
      const remaining = Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000));
      this.remainingSeconds.set(remaining);
      const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
      this.submitLockSeconds.set(Math.max(0, SUBMIT_LOCK_SECONDS - elapsed));
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
    this.codingSubmitted[questionId] = false;
    this.scheduleSave(questionId, this.buildCodingAnswer(questionId));
    this.testResults.set([]);
  }

  onLanguageChange(questionId: string, languageId: string): void {
    this.codingLanguagesByQuestion[questionId] = languageId;
    this.codingSubmitted[questionId] = false;
    this.scheduleSave(questionId, this.buildCodingAnswer(questionId));
    this.testResults.set([]);
  }

  async enterExamFullscreen(): Promise<void> {
    const shell = this.attemptShell?.nativeElement ?? document.documentElement;
    const ok = await this.proctoring.enterFullscreen(shell);
    if (ok) {
      this.fullscreenGateOpen.set(false);
    } else {
      this.toast.error('Could not enter fullscreen. Click again or use your browser fullscreen control.');
    }
  }

  async runPublicTests(questionId: string): Promise<void> {
    const code = this.codingAnswers[questionId] ?? '';
    if (!code.trim()) {
      this.toast.error('Write some code before running tests.');
      return;
    }

    this.runningTests.set(true);
    try {
      const language = this.codingLanguagesByQuestion[questionId] ?? DEFAULT_EXAM_CODING_LANGUAGE;
      const result = await this.examService.runPublicTests(this.attemptId, questionId, code, language);
      this.testResults.set(result.results);
      this.toast.info(`${result.passedCount}/${result.total} public tests passed`);
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not run tests');
    } finally {
      this.runningTests.set(false);
    }
  }

  async submitCode(questionId: string): Promise<void> {
    const code = this.codingAnswers[questionId] ?? '';
    if (!code.trim()) {
      this.toast.error('Write your solution before submitting.');
      return;
    }

    this.submittingCode.set(true);
    try {
      const answer = {
        ...this.buildCodingAnswer(questionId),
        submitted: true,
        submittedAt: new Date().toISOString()
      };
      await this.examService.saveAnswer(this.attemptId, questionId, answer);
      this.codingSubmitted[questionId] = true;
      this.toast.success('Code submitted for this question.');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not submit code');
    } finally {
      this.submittingCode.set(false);
    }
  }

  private buildCodingAnswer(questionId: string): Record<string, unknown> {
    return {
      code: this.codingAnswers[questionId] ?? '',
      language: this.codingLanguagesByQuestion[questionId] ?? DEFAULT_EXAM_CODING_LANGUAGE,
      submitted: this.codingSubmitted[questionId] ?? false
    };
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
      this.visitedIndices.update((set) => {
        const next = new Set(set);
        next.add(index);
        return next;
      });
      this.testResults.set([]);
    }
  }

  questionDotClass(q: ExamQuestion, index: number): Record<string, boolean> {
    const answered = this.isQuestionAnswered(q);
    const visited = this.visitedIndices().has(index) || this.currentIndex() === index;

    return {
      active: this.currentIndex() === index,
      answered,
      visited: visited && !answered,
      coding: q.type === 'coding'
    };
  }

  isQuestionAnswered(q: ExamQuestion): boolean {
    if (q.type === 'mcq') {
      return this.mcqSelections[q.id] !== undefined;
    }
    return this.codingSubmitted[q.id] === true;
  }

  isCodeSubmitted(questionId: string): boolean {
    return this.codingSubmitted[questionId] === true;
  }

  formatTestInput(input: string): string {
    return input.replace(/\n/g, '\\n') || '(empty)';
  }

  private normalizeLanguage(raw: string): string {
    const key = raw.toLowerCase();
    if (key === 'c++' || key === 'cpp') return 'cpp';
    if (key === 'js') return 'javascript';
    if (key === 'py') return 'python';
    return EXAM_CODING_LANGUAGES.some((lang) => lang.id === key) ? key : DEFAULT_EXAM_CODING_LANGUAGE;
  }

  async submitExam(): Promise<void> {
    if (this.submitting() || this.submitLockSeconds() > 0) return;

    const ok = await this.confirmDialog.confirm({
      title: 'Submit and leave the exam?',
      message:
        'You are about to submit your exam and leave this session. You will not be able to return or change your answers. Make sure you have answered every question you intend to submit.',
      confirmLabel: 'Submit and leave',
      cancelLabel: 'Continue exam',
      variant: 'danger'
    });
    if (!ok) return;

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

  fullscreenExited(): boolean {
    return this.proctoring.fullscreenExited();
  }
}
