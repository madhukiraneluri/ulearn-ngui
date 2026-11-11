import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CrtAnalyticsDashboard,
  CrtAnalyticsService,
} from '../../services/crt-analytics.service';
import { CrtShell } from '../crt-shell/crt-shell';

@Component({
  selector: 'app-crt-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CrtShell],
  templateUrl: './crt-analytics.html',
  styleUrl: './crt-analytics.scss',
})
export class CrtAnalytics implements OnInit {
  private readonly analytics = inject(CrtAnalyticsService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly dashboard = signal<CrtAnalyticsDashboard | null>(null);

  thresholdInput = '70';

  ngOnInit(): void {
    void this.load();
  }

  async apply(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const threshold = Number(this.thresholdInput.trim());
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      this.loading.set(false);
      this.error.set('Readiness threshold must be a number from 0 to 100.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      this.dashboard.set(await this.analytics.load(threshold));
    } catch (error: unknown) {
      this.dashboard.set(null);
      this.error.set(error instanceof Error ? error.message : 'Could not load CRT analytics.');
    } finally {
      this.loading.set(false);
    }
  }

  formatRate(rate: number): string {
    return `${(rate * 100).toFixed(2)}%`;
  }
}
