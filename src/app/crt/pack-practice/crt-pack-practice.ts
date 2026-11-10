import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CrtCompanyPackQuestion,
  CrtCompanyPackService
} from '../services/crt-company-pack.service';

type OptionIndex = 0 | 1 | 2 | 3;

@Component({
  selector: 'app-crt-pack-practice',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './crt-pack-practice.html',
  styles: `
    .crt-pack-practice {
      max-width: 720px;
      margin: 0 auto;
      padding: 48px 24px 72px;
    }
    .page-header a {
      color: var(--purple);
      font-weight: 700;
      text-decoration: none;
    }
    .page-header h1 {
      margin: 16px 0 8px;
      color: var(--navy);
      font-family: 'Poppins', sans-serif;
    }
    .status,
    .meta p,
    .confirm p {
      margin: 0;
      color: var(--muted);
    }
    .meta {
      display: grid;
      gap: 8px;
      margin-top: 24px;
    }
    .question {
      margin-top: 24px;
      padding: 20px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
    }
    .question h2 {
      margin: 0 0 16px;
      color: var(--navy);
      font-size: 1.15rem;
    }
    .options {
      display: grid;
      gap: 10px;
    }
    .options label {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
    }
    .options label.selected {
      border-color: var(--purple);
    }
    .status,
    .banner,
    .confirm,
    .actions {
      margin-top: 20px;
    }
    .banner,
    .confirm {
      padding: 16px;
      border-radius: 12px;
    }
    .banner {
      border: 1px solid #f3c2c2;
      background: #fdecec;
    }
    .banner p {
      margin: 0 0 12px;
      color: var(--navy);
    }
    .banner p:last-child {
      margin-bottom: 0;
    }
    .confirm {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      border: 1px solid var(--border);
      background: var(--card);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .btn-primary,
    .btn-secondary {
      padding: 10px 18px;
      border: none;
      border-radius: 8px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
    }
    .btn-primary {
      background: var(--purple);
      color: #fff;
    }
    .btn-secondary {
      background: var(--border);
      color: var(--navy);
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
    @media (max-width: 640px) {
      .crt-pack-practice {
        padding: 32px 16px 56px;
      }
    }
  `
})
export class CrtPackPractice implements OnInit {
  private readonly packs = inject(CrtCompanyPackService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly confirming = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);
  readonly questions = signal<CrtCompanyPackQuestion[]>([]);
  readonly questionIndex = signal(0);
  readonly packId = signal('');
  readonly attemptId = signal('');

  readonly currentQuestion = computed(() => this.questions()[this.questionIndex()] ?? null);
  readonly questionNumber = computed(() => this.questionIndex() + 1);
  readonly answeredCount = computed(() => {
    const selected = this.selections();
    return this.questions().filter((question) => selected[question.question_id] !== undefined).length;
  });
  readonly answersLocked = computed(() => this.saving() || this.submitting() || this.submitted());

  private beginInFlight = false;
  private pendingAttemptId: string | null = null;
  private readonly selections = signal<Partial<Record<string, OptionIndex>>>({});

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      void this.open(params.get('packId') ?? '', params.get('attemptId'));
    });
  }

  async load(): Promise<void> {
    const params = this.route.snapshot.paramMap;
    await this.open(params.get('packId') ?? '', params.get('attemptId'));
  }

  isSelected(index: number): boolean {
    const question = this.currentQuestion();
    if (!question) return false;
    return this.selections()[question.question_id] === index;
  }

  optionIndex(index: number): OptionIndex {
    if (index === 0 || index === 1 || index === 2 || index === 3) return index;
    return 0;
  }

  optionLabel(index: number): string {
    return ['A', 'B', 'C', 'D'][index] ?? '';
  }

  previous(): void {
    this.questionIndex.update((index) => Math.max(0, index - 1));
  }

  next(): void {
    this.questionIndex.update((index) => Math.min(this.questions().length - 1, index + 1));
  }

  async selectOption(selectedIndex: OptionIndex): Promise<void> {
    const question = this.currentQuestion();
    if (!question || this.answersLocked() || !this.attemptId()) return;

    const previous = this.selections()[question.question_id];
    if (previous === selectedIndex) return;

    this.selections.update((current) => ({ ...current, [question.question_id]: selectedIndex }));
    this.saving.set(true);
    this.saveError.set(null);

    try {
      const saved = await this.packs.saveAnswer(this.attemptId(), question.question_id, selectedIndex);
      if (saved.selected_index !== selectedIndex) {
        throw new Error('The saved answer did not match the selected option.');
      }
    } catch (error: unknown) {
      this.selections.update((current) => {
        const next = { ...current };
        if (previous === undefined) delete next[question.question_id];
        else next[question.question_id] = previous;
        return next;
      });
      this.saveError.set(this.message(error, 'Could not save this answer.'));
    } finally {
      this.saving.set(false);
    }
  }

  requestSubmit(): void {
    if (this.answersLocked() || this.submitted()) return;
    this.confirming.set(true);
  }

  cancelSubmit(): void {
    if (this.submitting()) return;
    this.confirming.set(false);
  }

  async confirmSubmit(): Promise<void> {
    if (!this.attemptId() || !this.packId() || this.saving() || this.submitting() || this.submitted()) return;

    this.submitting.set(true);
    this.submitError.set(null);

    try {
      await this.packs.submitAttempt(this.attemptId());
      this.submitted.set(true);
      this.confirming.set(false);
      const opened = await this.router.navigate([
        '/crt/packs',
        this.packId(),
        'attempts',
        this.attemptId(),
        'result'
      ]);
      if (!opened) {
        this.submitError.set('The attempt was submitted, but the result page did not open.');
      }
    } catch (error: unknown) {
      this.submitError.set(this.message(error, 'Could not submit this company pack.'));
    } finally {
      this.submitting.set(false);
    }
  }

  private async open(packId: string, attemptId: string | null): Promise<void> {
    this.packId.set(packId);
    if (!packId) {
      this.questions.set([]);
      this.loadError.set('This company pack could not be found.');
      this.loading.set(false);
      return;
    }

    if (!attemptId) {
      await this.beginAttempt(packId);
      return;
    }

    await this.resume(packId, attemptId);
  }

  private async beginAttempt(packId: string): Promise<void> {
    if (this.beginInFlight) return;
    this.beginInFlight = true;
    this.loading.set(true);
    this.loadError.set(null);
    this.saveError.set(null);
    this.submitError.set(null);

    try {
      let attemptId = this.pendingAttemptId;
      if (!attemptId) {
        const existing = await this.packs.listInProgressAttempts(packId);
        attemptId = existing[0]?.id ?? await this.packs.startAttempt(packId);
      }
      this.pendingAttemptId = attemptId;
      const opened = await this.router.navigate(
        ['/crt/packs', packId, 'attempts', attemptId],
        { replaceUrl: true }
      );
      if (!opened) {
        this.loadError.set('The attempt was started. Try again to continue it.');
        this.loading.set(false);
      }
    } catch (error: unknown) {
      this.questions.set([]);
      this.loadError.set(this.message(error, 'Could not start this company pack.'));
      this.loading.set(false);
    } finally {
      this.beginInFlight = false;
    }
  }

  private async resume(packId: string, attemptId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.saveError.set(null);
    this.submitError.set(null);

    try {
      const attempts = await this.packs.listInProgressAttempts(packId);
      const attempt = attempts.find((item) => item.id === attemptId);
      if (!attempt) {
        const submitted = await this.packs.getSubmittedAttempt(attemptId);
        if (submitted.pack_id !== packId) {
          throw new Error('This attempt does not belong to the selected company pack.');
        }
        await this.router.navigate([
          '/crt/packs',
          packId,
          'attempts',
          attemptId,
          'result'
        ]);
        return;
      }
      const [questions, saved] = await Promise.all([
        this.packs.getQuestions(attemptId),
        this.packs.listSelectedAnswers(attemptId)
      ]);
      this.applyAttempt(attemptId, questions, saved);
    } catch (error: unknown) {
      this.questions.set([]);
      this.attemptId.set('');
      this.loadError.set(this.message(error, 'Could not load this company pack.'));
    } finally {
      this.loading.set(false);
    }
  }

  private applyAttempt(
    attemptId: string,
    questions: CrtCompanyPackQuestion[],
    saved: { question_id: string; selected_index: OptionIndex | null }[],
  ): void {
    const restored: Partial<Record<string, OptionIndex>> = {};
    for (const answer of saved) {
      if (answer.selected_index !== null) restored[answer.question_id] = answer.selected_index;
    }

    this.attemptId.set(attemptId);
    this.selections.set(restored);
    this.questions.set(questions);
    this.questionIndex.set(0);
    this.submitted.set(false);
    this.confirming.set(false);
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
