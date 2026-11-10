import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CrtCompanyPackAttempt, CrtCompanyPackService } from '../services/crt-company-pack.service';

@Component({
  selector: 'app-crt-pack-result',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './crt-pack-result.html',
  styles: `
    .crt-pack-result {
      max-width: 720px;
      margin: 0 auto;
      padding: 48px 24px 72px;
    }
    .page-header a {
      color: var(--purple);
      font-weight: 700;
      text-decoration: none;
    }
    .page-links {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    .page-header h1 {
      margin: 16px 0 8px;
      color: var(--navy);
      font-family: 'Poppins', sans-serif;
    }
    .status,
    .note {
      margin: 0;
      color: var(--muted);
    }
    .summary {
      display: grid;
      gap: 12px;
      margin-top: 32px;
      padding: 20px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
    }
    .summary dt {
      color: var(--muted);
      font-size: 0.875rem;
    }
    .summary dd {
      margin: 4px 0 0;
      color: var(--navy);
      font-size: 1.25rem;
      font-weight: 700;
    }
    .confirmation {
      margin-top: 24px;
      color: var(--navy);
      font-weight: 700;
    }
    .note,
    .status,
    .banner {
      margin-top: 24px;
    }
    .note {
      max-width: 62ch;
      line-height: 1.5;
    }
    .banner {
      padding: 16px;
      border: 1px solid #f3c2c2;
      border-radius: 12px;
      background: #fdecec;
    }
    .banner p {
      margin: 0 0 12px;
      color: var(--navy);
    }
    .btn-primary {
      padding: 10px 18px;
      border: none;
      border-radius: 8px;
      background: var(--purple);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    @media (max-width: 640px) {
      .crt-pack-result {
        padding: 32px 16px 56px;
      }
    }
  `
})
export class CrtPackResult implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly packs = inject(CrtCompanyPackService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly result = signal<CrtCompanyPackAttempt | null>(null);
  readonly percentage = computed(() => scorePercentage(this.result()));
  readonly feedback = computed(() => completionFeedback(this.percentage()));

  private packId = '';
  private attemptId = '';

  ngOnInit(): void {
    this.packId = this.route.snapshot.paramMap.get('packId') ?? '';
    this.attemptId = this.route.snapshot.paramMap.get('attemptId') ?? '';
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);

    if (!this.packId || !this.attemptId) {
      this.result.set(null);
      this.loadError.set('This result could not be found.');
      this.loading.set(false);
      return;
    }

    try {
      const attempt = await this.packs.getSubmittedAttempt(this.attemptId);
      if (attempt.pack_id !== this.packId) {
        this.result.set(null);
        this.loadError.set('This result does not belong to the selected company pack.');
        return;
      }
      this.result.set(attempt);
    } catch (error: unknown) {
      this.result.set(null);
      this.loadError.set(error instanceof Error ? error.message : 'Could not load this result.');
    } finally {
      this.loading.set(false);
    }
  }

  scoreText(): string {
    return formatScore(this.result()?.score ?? null);
  }

  maxScoreText(): string {
    return formatScore(this.result()?.max_score ?? null);
  }

  percentageText(): string {
    const percentage = this.percentage();
    return percentage === null ? 'Not available' : `${percentage}%`;
  }
}

function scorePercentage(attempt: CrtCompanyPackAttempt | null): number | null {
  const score = attempt?.score;
  const maxScore = attempt?.max_score;
  if (score === null || score === undefined || maxScore === null || maxScore === undefined || maxScore <= 0) {
    return null;
  }
  return Math.round((score / maxScore) * 100);
}

function completionFeedback(percentage: number | null): string {
  if (percentage === null) return 'Your company pack attempt has been submitted.';
  if (percentage === 100) return 'You answered every question correctly.';
  return 'Your company pack attempt has been submitted.';
}

function formatScore(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Not available';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}
