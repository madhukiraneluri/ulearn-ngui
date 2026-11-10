import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CrtCompanyPack,
  CrtCompanyPackService
} from '../services/crt-company-pack.service';

interface CompanyPackCard {
  pack: CrtCompanyPack;
  attemptId: string | null;
}

@Component({
  selector: 'app-crt-company-packs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './crt-packs.html',
  styles: `
    .crt-packs {
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

    .page-header p,
    .pack-card p,
    .status {
      margin: 0;
      color: var(--muted);
    }

    .status,
    .banner {
      margin-top: 32px;
    }

    .banner {
      padding: 16px;
      border: 1px solid #f3c2c2;
      border-radius: 12px;
      background: #fdecec;
    }

    .banner p {
      margin-bottom: 12px;
      color: var(--navy);
    }

    .pack-list {
      display: grid;
      gap: 16px;
      margin: 32px 0 0;
      padding: 0;
      list-style: none;
    }

    .pack-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 20px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
    }

    .pack-card h2 {
      margin: 0 0 8px;
      color: var(--navy);
      font-size: 1.15rem;
    }

    .btn-primary {
      flex: none;
      padding: 10px 18px;
      border: none;
      border-radius: 8px;
      background: var(--purple);
      color: #fff;
      font: inherit;
      font-weight: 700;
      text-decoration: none;
    }

    .btn-primary:disabled {
      opacity: 0.72;
      cursor: not-allowed;
    }

    @media (max-width: 640px) {
      .crt-packs {
        padding: 32px 16px 56px;
      }

      .pack-card {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `
})
export class CrtCompanyPacks implements OnInit {
  private readonly packsService = inject(CrtCompanyPackService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly packs = signal<CompanyPackCard[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);

    try {
      const [packs, attempts] = await Promise.all([
        this.packsService.listPublishedPacks(),
        this.packsService.listInProgressAttempts()
      ]);
      const attemptByPack = new Map<string, string>();
      for (const attempt of attempts) {
        if (!attemptByPack.has(attempt.pack_id)) {
          attemptByPack.set(attempt.pack_id, attempt.id);
        }
      }
      this.packs.set(packs.map((pack) => ({
        pack,
        attemptId: attemptByPack.get(pack.id) ?? null
      })));
    } catch (error: unknown) {
      this.packs.set([]);
      this.loadError.set(error instanceof Error ? error.message : 'Could not load company packs.');
    } finally {
      this.loading.set(false);
    }
  }

  practiceLink(card: CompanyPackCard): string[] {
    return card.attemptId
      ? ['/crt/packs', card.pack.id, 'attempts', card.attemptId]
      : ['/crt/packs', card.pack.id, 'practice'];
  }
}
