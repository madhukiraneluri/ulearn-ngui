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
import {
  DEFAULT_EXAM_CODING_LANGUAGE,
  EXAM_CODING_LANGUAGES,
  defaultStarterCode
} from '../exam-coding-languages.config';
import type { ExamPublicTestResult } from '../models/exam-test-result.model';
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

  readonly codingLanguages = EXAM_CODING_LANGUAGES;
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly submittingCode = signal(false);
  readonly runningTests = signal(false);
  readonly testResults = signal<ExamPublicTestResult[]>([]);
  readonly attempt = signal<ExamAttemptRecord | null>(null);
  readonly questions = signal<ExamQuestion[]>([]);
  readonly currentIndex = signal(0);
  readonly remainingSeconds = signal(0);
  readonly fullscreenWarnings = signal(0);
  readonly visitedIndices = signal<Set<number>>(new Set([0]));

  readonly currentQuestion = computed(() => {
    const list = this.questions();
    const idx = this.currentIndex();
    return list[idx] ?? null;
  });

  readonly isCodingQuestion = computed(() => this.currentQuestion()?.type === 'coding');

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
        if (!this.codingAnswers[q.id]) {
          this.codingAnswers[q.id] =
            payload.starterCode ?? defaultStarterCode(this.codingLanguagesByQuestion[q.id]);
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
    this.codingSubmitted[questionId] = false;
    this.scheduleSave(questionId, this.buildCodingAnswer(questionId));
    this.testResults.set([]);
  }

  onLanguageChange(questionId: string, languageId: string): void {
    const previous = this.codingLanguagesByQuestion[questionId] ?? DEFAULT_EXAM_CODING_LANGUAGE;
    const currentCode = this.codingAnswers[questionId] ?? '';
    const previousStarter = defaultStarterCode(previous);
    const payload = this.questions().find((q) => q.id === questionId)?.payload as ExamCodingPayload | undefined;

    this.codingLanguagesByQuestion[questionId] = languageId;

    if (!currentCode.trim() || currentCode.trim() === previousStarter.trim()) {
      this.codingAnswers[questionId] = payload?.starterCode ?? defaultStarterCode(languageId);
    }

    this.codingSubmitted[questionId] = false;
    this.scheduleSave(questionId, this.buildCodingAnswer(questionId));
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

  fullscreenExited(): boolean {
    return this.proctoring.fullscreenExited();
  }
}
