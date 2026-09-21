import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ExamRegistrationService } from '../services/exam-registration.service';
import { ExamBulkImportService } from '../services/exam-bulk-import.service';
import { AdminExamsService } from '../services/admin-exams.service';
import { ToastService } from '../../core/services/toast';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { EXAM_ROLE_DEFINITIONS } from '../exam-portal/exam-role.config';
import { downloadAdminTableXlsx } from '../utils/admin-table-export.util';
import type {
  Exam,
  ExamCodingPayload,
  ExamMcqPayload,
  ExamRegistration,
  ExamResultDetail,
  ExamResultQuestionReview,
  ExamResultRow,
  ExamTestCase
} from '../../models/index';

const IMPORT_BATCH_SIZE = 25;

type ImportModalPhase = 'idle' | 'importing' | 'success' | 'error';

@Component({
  selector: 'app-exam-registrations',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './exam-registrations.html',
  styleUrl: './exam-registrations.scss'
})
export class ExamRegistrations implements OnInit {
  private readonly registrationService = inject(ExamRegistrationService);
  private readonly bulkImport = inject(ExamBulkImportService);
  private readonly examsService = inject(AdminExamsService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly roleOptions = EXAM_ROLE_DEFINITIONS;
  readonly exams = signal<Exam[]>([]);
  readonly rows = signal<ExamRegistration[]>([]);
  readonly results = signal<ExamResultRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly importing = signal(false);
  readonly deleting = signal(false);
  readonly sending = signal(false);
  readonly resettingId = signal<string | null>(null);
  readonly tempPasswords = signal<Record<string, string>>({});
  readonly activeTab = signal<'registrations' | 'results'>('registrations');

  readonly importModalOpen = signal(false);
  readonly importPhase = signal<ImportModalPhase>('idle');
  readonly importProcessed = signal(0);
  readonly importTotal = signal(0);
  readonly importSuccessCount = signal(0);
  readonly importFailedCount = signal(0);
  readonly importMultiRoleCount = signal(0);
  readonly importErrorMessage = signal('');

  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly goToPageInput = signal('1');
  readonly search = signal('');
  readonly roleFilter = signal('');
  readonly emailFilter = signal<'all' | 'sent' | 'pending'>('all');
  readonly examFilter = signal('');
  readonly resultsRoleFilter = signal('');
  readonly resultDetailOpen = signal(false);
  readonly resultDetailLoading = signal(false);
  readonly resultDetail = signal<ExamResultDetail | null>(null);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  readonly rangeStart = computed(() => {
    if (this.total() === 0) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  });

  readonly rangeEnd = computed(() => {
    if (this.total() === 0) return 0;
    return Math.min(this.page() * this.pageSize(), this.total());
  });

  readonly importPercent = computed(() => {
    const total = this.importTotal();
    if (total <= 0) return 0;
    return Math.min(100, Math.round((this.importProcessed() / total) * 100));
  });

  ngOnInit(): void {
    void this.loadExams();
    void this.loadRegistrations();
    void this.loadResults();
  }

  private async loadExams(): Promise<void> {
    try {
      this.exams.set(await this.examsService.listExams());
    } catch {
      // non-blocking
    }
  }

  async loadRegistrations(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.registrationService.listRegistrations({
        page: this.page(),
        pageSize: this.pageSize(),
        search: this.search(),
        roleSlug: this.roleFilter() || undefined,
        emailStatus: this.emailFilter(),
        examId: this.examFilter() || undefined
      });
      this.rows.set(result.rows);
      this.total.set(result.total);
      this.goToPageInput.set(String(this.page()));
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not load registrations');
    } finally {
      this.loading.set(false);
    }
  }

  async loadResults(): Promise<void> {
    try {
      this.results.set(
        await this.registrationService.listResults(
          undefined,
          this.resultsRoleFilter() || undefined
        )
      );
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not load results');
    }
  }

  applyFilters(): void {
    this.page.set(1);
    void this.loadRegistrations();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    void this.importFile(file);
    input.value = '';
  }

  private async importFile(file: File): Promise<void> {
    this.importing.set(true);
    this.importModalOpen.set(true);
    this.importPhase.set('importing');
    this.importProcessed.set(0);
    this.importSuccessCount.set(0);
    this.importFailedCount.set(0);
    this.importMultiRoleCount.set(0);
    this.importErrorMessage.set('');

    try {
      const parsed = await this.bulkImport.parseExcelFile(file);
      if (parsed.length === 0) {
        this.importPhase.set('error');
        this.importErrorMessage.set('No rows found in Excel file.');
        return;
      }

      const { rows: normalized, multiRoleReassigned } =
        this.bulkImport.normalizeMultiRoleApplicants(parsed);
      this.importMultiRoleCount.set(multiRoleReassigned);
      this.importTotal.set(normalized.length);
      await this.flushUi();

      const importBatchId = crypto.randomUUID();
      let success = 0;
      let failed = 0;

      for (let i = 0; i < normalized.length; i += IMPORT_BATCH_SIZE) {
        const chunk = normalized.slice(i, i + IMPORT_BATCH_SIZE);
        const result = await this.registrationService.importFromExcel(chunk, importBatchId);
        success += result.summary.success;
        failed += result.summary.failed;
        this.importProcessed.set(Math.min(i + chunk.length, normalized.length));
        this.importSuccessCount.set(success);
        this.importFailedCount.set(failed);
        await this.flushUi();
      }

      this.importPhase.set('success');
      await this.loadRegistrations();
    } catch (err) {
      this.importPhase.set('error');
      this.importErrorMessage.set(err instanceof Error ? err.message : 'Import failed');
    } finally {
      this.importing.set(false);
    }
  }

  closeImportModal(): void {
    this.importModalOpen.set(false);
    this.importPhase.set('idle');
  }

  downloadTemplate(): void {
    this.bulkImport.downloadSampleExcel();
  }

  async deleteAllRegistrations(): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'Delete all registrations?',
      message:
        'This removes every imported registration and unassigns all recruitment exam candidates. Accounts are not deleted. This cannot be undone.',
      confirmLabel: 'Delete all',
      variant: 'danger'
    });
    if (!ok) return;

    this.deleting.set(true);
    try {
      await this.registrationService.deleteAllRegistrations();
      this.page.set(1);
      await this.loadRegistrations();
      this.toast.success('All registrations deleted');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      this.deleting.set(false);
    }
  }

  async sendAllPendingEmails(): Promise<void> {
    this.sending.set(true);
    try {
      const result = await this.registrationService.sendCredentials({ onlyUnsent: true });
      this.storeTempPasswords(result.results);
      this.toast.success(`${result.summary.sent} emails sent, ${result.summary.failed} failed`);
      await this.loadRegistrations();
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      this.sending.set(false);
    }
  }

  async sendFilteredEmails(): Promise<void> {
    this.sending.set(true);
    try {
      const result = await this.registrationService.sendCredentials({
        examId: this.examFilter() || undefined,
        onlyUnsent: this.emailFilter() !== 'sent'
      });
      this.storeTempPasswords(result.results);
      this.toast.success(`${result.summary.sent} emails sent`);
      await this.loadRegistrations();
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      this.sending.set(false);
    }
  }

  async resetAndSendCredentials(row: ExamRegistration): Promise<void> {
    if (!row.userId) {
      this.toast.error('Student account is not provisioned yet');
      return;
    }

    const ok = await this.confirmDialog.confirm({
      title: 'Reset temporary password?',
      message: `Generate a new temporary password for ${row.fullName} and send the credentials email again.`,
      confirmLabel: 'Reset & send email',
      variant: 'danger'
    });
    if (!ok) return;

    this.resettingId.set(row.id);
    try {
      const result = await this.registrationService.resetAndSendCredentials(row.id);
      if (result.tempPassword) {
        this.tempPasswords.update((map) => ({ ...map, [row.id]: result.tempPassword! }));
      }
      this.toast.success(`Credentials sent to ${row.email}`);
      await this.loadRegistrations();
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      this.resettingId.set(null);
    }
  }

  tempPasswordFor(rowId: string): string | null {
    return this.tempPasswords()[rowId] ?? null;
  }

  isResetting(rowId: string): boolean {
    return this.resettingId() === rowId;
  }

  copyTempPassword(password: string): void {
    void navigator.clipboard.writeText(password).then(
      () => this.toast.success('Temporary password copied'),
      () => this.toast.error('Could not copy password')
    );
  }

  private storeTempPasswords(results: Array<{ registrationId: string; tempPassword?: string }>): void {
    const updates: Record<string, string> = {};
    for (const row of results) {
      if (row.tempPassword) updates[row.registrationId] = row.tempPassword;
    }
    if (Object.keys(updates).length === 0) return;
    this.tempPasswords.update((map) => ({ ...map, ...updates }));
  }

  goPage(delta: number): void {
    const next = this.page() + delta;
    if (next < 1 || next > this.totalPages()) return;
    this.page.set(next);
    void this.loadRegistrations();
  }

  goToFirstPage(): void {
    if (this.page() === 1) return;
    this.page.set(1);
    void this.loadRegistrations();
  }

  goToLastPage(): void {
    const last = this.totalPages();
    if (this.page() === last) return;
    this.page.set(last);
    void this.loadRegistrations();
  }

  onGoToPageInput(value: string): void {
    this.goToPageInput.set(value.replace(/\D/g, ''));
  }

  goToPage(): void {
    const parsed = Number(this.goToPageInput());
    if (!parsed || Number.isNaN(parsed)) {
      this.goToPageInput.set(String(this.page()));
      return;
    }
    const target = Math.min(Math.max(1, parsed), this.totalPages());
    if (target === this.page()) {
      this.goToPageInput.set(String(target));
      return;
    }
    this.page.set(target);
    void this.loadRegistrations();
  }

  onPageSizeChange(value: string): void {
    const size = Number(value);
    if (!size || size < 1) return;
    this.pageSize.set(size);
    this.page.set(1);
    void this.loadRegistrations();
  }

  onResultsRoleChange(): void {
    void this.loadResults();
  }

  async openResultDetail(row: ExamResultRow): Promise<void> {
    this.resultDetailOpen.set(true);
    this.resultDetailLoading.set(true);
    this.resultDetail.set(null);

    try {
      this.resultDetail.set(await this.registrationService.getResultDetail(row.id));
    } catch (err) {
      this.resultDetailOpen.set(false);
      this.toast.error(err instanceof Error ? err.message : 'Could not load result details');
    } finally {
      this.resultDetailLoading.set(false);
    }
  }

  closeResultDetail(): void {
    this.resultDetailOpen.set(false);
    this.resultDetail.set(null);
  }

  roleLabel(slug: string): string {
    return this.roleOptions.find((role) => role.slug === slug)?.name ?? slug;
  }

  mcqQuestions(detail: ExamResultDetail): ExamResultQuestionReview[] {
    return detail.questions.filter((item) => item.question.type === 'mcq');
  }

  codingQuestions(detail: ExamResultDetail): ExamResultQuestionReview[] {
    return detail.questions.filter((item) => item.question.type === 'coding');
  }

  mcqPayload(review: ExamResultQuestionReview): ExamMcqPayload {
    return review.question.payload as ExamMcqPayload;
  }

  codingPayload(review: ExamResultQuestionReview): ExamCodingPayload {
    return review.question.payload as ExamCodingPayload;
  }

  optionLetter(index: number): string {
    return String.fromCharCode(65 + index);
  }

  selectedMcqIndex(review: ExamResultQuestionReview): number | null {
    const fromBreakdown = review.mcqBreakdown?.selectedIndex;
    if (typeof fromBreakdown === 'number') return fromBreakdown;
    const fromAnswer = review.answer?.['selectedIndex'];
    return typeof fromAnswer === 'number' ? fromAnswer : null;
  }

  correctMcqIndex(review: ExamResultQuestionReview): number {
    return review.mcqBreakdown?.correctIndex ?? this.mcqPayload(review).correctIndex;
  }

  mcqEarned(review: ExamResultQuestionReview): number {
    return review.mcqBreakdown?.earned ?? 0;
  }

  mcqMarks(review: ExamResultQuestionReview): number {
    return review.mcqBreakdown?.marks ?? this.mcqPayload(review).marks;
  }

  codingEarned(review: ExamResultQuestionReview): number {
    return review.codingBreakdown?.earned ?? 0;
  }

  codingMarks(review: ExamResultQuestionReview): number {
    return review.codingBreakdown?.marks ?? this.codingPayload(review).marks;
  }

  codingPassedTests(review: ExamResultQuestionReview): number {
    return review.codingBreakdown?.passedTests ?? 0;
  }

  codingTotalTests(review: ExamResultQuestionReview): number {
    return review.codingBreakdown?.totalTests ?? this.codingTestCases(review).length;
  }

  submittedCode(review: ExamResultQuestionReview): string {
    const code = review.answer?.['code'];
    return typeof code === 'string' ? code : '';
  }

  submittedLanguage(review: ExamResultQuestionReview): string {
    const language = review.answer?.['language'];
    if (typeof language === 'string' && language.trim()) return language;
    return this.codingPayload(review).language;
  }

  codingTestCases(review: ExamResultQuestionReview): Array<ExamTestCase & { kind: 'Public' | 'Hidden' }> {
    const payload = this.codingPayload(review);
    return [
      ...(payload.publicTestCases ?? []).map((testCase) => ({ ...testCase, kind: 'Public' as const })),
      ...(payload.hiddenTestCases ?? []).map((testCase) => ({ ...testCase, kind: 'Hidden' as const }))
    ];
  }

  exportResults(): void {
    const rows = this.results();
    if (rows.length === 0) return;

    const columns = [
      { id: 'name', label: 'Name' },
      { id: 'email', label: 'Email' },
      { id: 'role', label: 'Role' },
      { id: 'mcq', label: 'MCQ Score' },
      { id: 'coding', label: 'Coding Score' },
      { id: 'total', label: 'Total' },
      { id: 'pct', label: 'Percentage' },
      { id: 'warnings', label: 'Fullscreen Warnings' }
    ];

    downloadAdminTableXlsx(
      rows,
      columns,
      columns.map((c) => c.id),
      `exam-results-${this.resultsRoleFilter() || 'all'}`,
      (row, col) => {
        switch (col) {
          case 'name': return row.studentName;
          case 'email': return row.studentEmail;
          case 'role': return row.roleSlug;
          case 'mcq': return `${row.mcqScore}/${row.mcqMax}`;
          case 'coding': return `${row.codingScore}/${row.codingMax}`;
          case 'total': return `${row.totalScore}/${row.totalMax}`;
          case 'pct': return `${row.percentage}%`;
          case 'warnings': return String(row.fullscreenWarnings);
          default: return '';
        }
      }
    );
  }

  emailStatusLabel(row: ExamRegistration): string {
    if (row.provisionError) return 'Error';
    return row.credentialsSentAt ? 'Sent' : 'Pending';
  }

  private flushUi(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}
