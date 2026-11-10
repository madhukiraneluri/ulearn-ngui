import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast';
import {
  CrtMentorDashboardFilterMeta,
  CrtMentorDashboardReport,
  CrtMentorDashboardReportQuery,
  CrtMentorDashboardService,
  type CrtMentorDashboardPathOption,
} from '../../services/crt-mentor-dashboard.service';
import { CrtShell } from '../crt-shell/crt-shell';
import { mentorDashboardCsv } from './mentor-dashboard-csv';

const PAGE_SIZE = 25;
const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_ROWS = 20000;

@Component({
  selector: 'app-crt-mentor-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CrtShell],
  templateUrl: './crt-mentor-dashboard.html',
  styleUrl: './crt-mentor-dashboard.scss',
})
export class CrtMentorDashboard implements OnInit {
  private readonly dashboard = inject(CrtMentorDashboardService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly error = signal<string | null>(null);
  readonly exportError = signal<string | null>(null);
  readonly filterMeta = signal<CrtMentorDashboardFilterMeta>({ batches: [] });
  readonly report = signal<CrtMentorDashboardReport | null>(null);

  batchId = '';
  pathId = '';
  readinessBelowInput = '';
  inactiveDaysInput = '';
  private offset = 0;

  readonly pathOptions = computed((): CrtMentorDashboardPathOption[] => {
    const meta = this.filterMeta();
    if (!this.batchId) {
      const byId = new Map<string, CrtMentorDashboardPathOption>();
      for (const batch of meta.batches) {
        for (const path of batch.paths) {
          byId.set(path.id, path);
        }
      }
      return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
    }
    const batch = meta.batches.find((item) => item.id === this.batchId);
    return batch ? [...batch.paths] : [];
  });

  readonly statusWindowHint = computed(() => {
    const trimmed = this.inactiveDaysInput.trim();
    if (trimmed) {
      const days = Number(trimmed);
      if (Number.isInteger(days) && days >= 0) {
        return `Status uses a ${days}-day activity window and the inactive filter shows students without a submitted attempt in that period.`;
      }
    }
    return 'Status uses the default 7-day activity window when no inactive filter is set.';
  });

  ngOnInit(): void {
    void this.reload(true);
  }

  onBatchChange(): void {
    if (!this.pathId) return;
    if (!this.pathOptions().some((path) => path.id === this.pathId)) {
      this.pathId = '';
    }
  }

  async apply(): Promise<void> {
    this.offset = 0;
    await this.reload(false);
  }

  async previousPage(): Promise<void> {
    this.offset = Math.max(0, this.offset - PAGE_SIZE);
    await this.reload(false);
  }

  async nextPage(): Promise<void> {
    this.offset += PAGE_SIZE;
    await this.reload(false);
  }

  async exportCsv(): Promise<void> {
    const query = this.buildQuery(EXPORT_PAGE_SIZE, 0);
    if (!query) return;

    this.exporting.set(true);
    this.exportError.set(null);
    try {
      const rows = [];
      let offset = 0;
      let total = 0;
      do {
        const page = await this.dashboard.report({ ...query, limit: EXPORT_PAGE_SIZE, offset });
        total = page.page.total;
        if (total > EXPORT_MAX_ROWS) {
          this.exportError.set(
            `This export has more than ${EXPORT_MAX_ROWS} rows. Narrow the batch, path, or filters.`,
          );
          return;
        }
        rows.push(...page.rows);
        offset += page.rows.length;
        if (page.rows.length === 0) break;
      } while (offset < total);

      this.download(mentorDashboardCsv(rows), this.exportFilename());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not export mentor dashboard CSV.';
      this.exportError.set(message);
      this.toast.error(message);
    } finally {
      this.exporting.set(false);
    }
  }

  formatLastAttempt(value: string | null): string {
    if (!value) return 'No submitted attempts';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  statusLabel(status: 'active' | 'inactive'): string {
    return status === 'active' ? 'Active' : 'Inactive';
  }

  pageStart(): number {
    const current = this.report();
    if (!current || current.page.total === 0) return 0;
    return current.page.offset + 1;
  }

  pageEnd(): number {
    const current = this.report();
    if (!current) return 0;
    return Math.min(current.page.total, current.page.offset + current.rows.length);
  }

  canGoBack(): boolean {
    return (this.report()?.page.offset ?? 0) > 0;
  }

  canGoForward(): boolean {
    const current = this.report();
    if (!current) return false;
    return current.page.offset + current.rows.length < current.page.total;
  }

  private async reload(includeFilters: boolean): Promise<void> {
    const query = this.buildQuery(PAGE_SIZE, this.offset);
    if (!query) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      const reportPromise = this.dashboard.report(query);
      if (includeFilters) {
        const [filters, report] = await Promise.all([
          this.dashboard.loadFilters(),
          reportPromise,
        ]);
        this.filterMeta.set(filters);
        this.report.set(report);
      } else {
        this.report.set(await reportPromise);
      }
    } catch (err) {
      this.report.set(null);
      const message =
        err instanceof Error ? err.message : 'Could not load the CRT mentor dashboard.';
      this.error.set(message);
      this.toast.error(message);
    } finally {
      this.loading.set(false);
    }
  }

  private buildQuery(limit: number, offset: number): CrtMentorDashboardReportQuery | null {
    const parsed = this.parseQueryInputs();
    if (!parsed) return null;
    return { ...parsed, limit, offset };
  }

  private parseQueryInputs():
    | {
        batchId: string | null;
        pathId: string | null;
        readinessBelow: number | null;
        inactiveDays: number | null;
      }
    | null {
    const readinessTrimmed = this.readinessBelowInput.trim();
    let readinessBelow: number | null = null;
    if (readinessTrimmed) {
      const value = Number(readinessTrimmed);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        this.error.set('Readiness threshold must be a number from 0 to 100.');
        this.toast.error('Readiness threshold must be a number from 0 to 100.');
        return null;
      }
      readinessBelow = value;
    }

    const inactiveTrimmed = this.inactiveDaysInput.trim();
    let inactiveDays: number | null = null;
    if (inactiveTrimmed) {
      const value = Number(inactiveTrimmed);
      if (!Number.isInteger(value) || value < 0) {
        this.error.set('Inactive days must be a whole number of 0 or greater.');
        this.toast.error('Inactive days must be a whole number of 0 or greater.');
        return null;
      }
      inactiveDays = value;
    }

    return {
      batchId: this.batchId || null,
      pathId: this.pathId || null,
      readinessBelow,
      inactiveDays,
    };
  }

  private exportFilename(): string {
    const stamp = new Date().toISOString().slice(0, 10);
    const batch = this.batchId ? `batch-${this.batchId.slice(0, 8)}` : 'all-batches';
    return `crt-mentor-dashboard-${batch}-${stamp}.csv`;
  }

  private download(contents: string, filename: string): void {
    const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    this.toast.success('CSV export started.');
  }
}
