import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
  ExamNotAttendedRow,
  ExamPortalStats,
  ExamAssignmentFilter,
  ExamMultiExamFilter,
  ExamPortalFilterParams,
  ExamResultDetail,
  ExamResultQuestionReview,
  ExamResultRow,
  ExamTestCase
} from '../../models/index';

const IMPORT_BATCH_SIZE = 25;
/** Matches send-exam-credentials edge function batch size */
const EMAIL_SEND_BATCH_SIZE = 40;

type ImportModalPhase = 'idle' | 'importing' | 'success' | 'error';
type ExamPortalTab = 'registrations' | 'results' | 'not-started';
type ClientPagedTab = 'results' | 'not-started';

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
  private readonly cdr = inject(ChangeDetectorRef);

  readonly roleOptions = EXAM_ROLE_DEFINITIONS;
  readonly emailSendBatchSize = EMAIL_SEND_BATCH_SIZE;
  readonly exams = signal<Exam[]>([]);
  readonly rows = signal<ExamRegistration[]>([]);
  readonly results = signal<ExamResultRow[]>([]);
  readonly notAttended = signal<ExamNotAttendedRow[]>([]);
  readonly notAttendedLoading = signal(false);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly importing = signal(false);
  readonly deleting = signal(false);
  readonly sending = signal(false);
  readonly resettingId = signal<string | null>(null);
  readonly tempPasswords = signal<Record<string, string>>({});
  readonly activeTab = signal<ExamPortalTab>('registrations');

  readonly importModalOpen = signal(false);
  readonly importPhase = signal<ImportModalPhase>('idle');
  readonly importProcessed = signal(0);
  readonly importTotal = signal(0);
  readonly importSuccessCount = signal(0);
  readonly importFailedCount = signal(0);
  readonly importMultiRoleCount = signal(0);
  readonly importErrorMessage = signal('');

  readonly sendModalOpen = signal(false);
  readonly sendPhase = signal<'idle' | 'sending' | 'success' | 'error'>('idle');
  readonly sendProcessed = signal(0);
  readonly sendTotal = signal(0);
  readonly sendSentCount = signal(0);
  readonly sendFailedCount = signal(0);
  readonly sendErrorMessage = signal('');

  readonly addStudentOpen = signal(false);
  readonly addStudentSubmitting = signal(false);
  readonly addStudentEmail = signal('');
  readonly addStudentName = signal('');
  readonly addStudentRoleSlug = signal('');
  readonly addStudentSendEmail = signal(true);

  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly goToPageInput = signal('1');
  readonly search = signal('');
  readonly roleFilter = signal('');
  readonly emailFilter = signal<'all' | 'sent' | 'pending'>('all');
  readonly examFilter = signal('');
  readonly assignmentFilter = signal<ExamAssignmentFilter>('all');
  readonly multiExamFilter = signal<ExamMultiExamFilter>('all');
  readonly portalStats = signal<ExamPortalStats>({
    registrations: 0,
    submitted: 0,
    notStarted: 0,
    inProgress: 0,
    notProvisioned: 0
  });
  readonly portalStatsLoading = signal(false);

  readonly statsAccountedTotal = computed(() => {
    const s = this.portalStats();
    return s.submitted + s.notStarted + s.inProgress + s.notProvisioned;
  });
  readonly resultsPageSize = signal(50);
  readonly resultsGoToPageInput = signal('1');
  readonly resultsLoading = signal(false);

  readonly notStartedPage = signal(1);
  readonly notStartedPageSize = signal(50);
  readonly notStartedGoToPageInput = signal('1');

  readonly resultsPage = signal(1);

  readonly resultsTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.results().length / this.resultsPageSize()))
  );

  readonly notStartedTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.notAttended().length / this.notStartedPageSize()))
  );

  readonly paginatedResults = computed(() => {
    const start = (this.resultsPage() - 1) * this.resultsPageSize();
    return this.results().slice(start, start + this.resultsPageSize());
  });

  readonly paginatedNotStarted = computed(() => {
    const start = (this.notStartedPage() - 1) * this.notStartedPageSize();
    return this.notAttended().slice(start, start + this.notStartedPageSize());
  });

  readonly resultsRangeStart = computed(() => {
    if (this.results().length === 0) return 0;
    return (this.resultsPage() - 1) * this.resultsPageSize() + 1;
  });

  readonly resultsRangeEnd = computed(() => {
    if (this.results().length === 0) return 0;
    return Math.min(this.resultsPage() * this.resultsPageSize(), this.results().length);
  });

  readonly notStartedRangeStart = computed(() => {
    if (this.notAttended().length === 0) return 0;
    return (this.notStartedPage() - 1) * this.notStartedPageSize() + 1;
  });

  readonly notStartedRangeEnd = computed(() => {
    if (this.notAttended().length === 0) return 0;
    return Math.min(this.notStartedPage() * this.notStartedPageSize(), this.notAttended().length);
  });
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

  readonly sendPercent = computed(() => {
    const total = this.sendTotal();
    if (total <= 0) return 0;
    return Math.min(100, Math.round((this.sendProcessed() / total) * 100));
  });

  ngOnInit(): void {
    void this.loadExams();
    void this.loadPortalStats();
    void this.loadRegistrations();
    void this.loadResults();
    void this.loadNotAttended();
  }

  private portalFilterParams(): ExamPortalFilterParams {
    return {
      roleSlug: this.roleFilter() || undefined,
      examId: this.examFilter() || undefined,
      assignmentFilter: this.assignmentFilter(),
      multiExamFilter: this.multiExamFilter()
    };
  }

  async loadPortalStats(): Promise<void> {
    this.portalStatsLoading.set(true);
    try {
      this.portalStats.set(await this.registrationService.getPortalStats(this.portalFilterParams()));
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not load summary counts');
    } finally {
      this.portalStatsLoading.set(false);
    }
  }

  onPortalFilterChange(): void {
    this.page.set(1);
    this.resultsPage.set(1);
    this.notStartedPage.set(1);
    this.resultsGoToPageInput.set('1');
    this.notStartedGoToPageInput.set('1');
    void this.loadPortalStats();
    void this.loadRegistrations();
    void this.loadResults();
    void this.loadNotAttended();
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
        examId: this.examFilter() || undefined,
        assignmentFilter: this.assignmentFilter(),
        multiExamFilter: this.multiExamFilter()
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
    this.resultsLoading.set(true);
    try {
      this.results.set(
        await this.registrationService.listResults(
          this.examFilter() || undefined,
          this.roleFilter() || undefined,
          this.portalFilterParams()
        )
      );
      this.resultsPage.set(1);
      this.resultsGoToPageInput.set('1');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not load results');
    } finally {
      this.resultsLoading.set(false);
    }
  }

  async loadNotAttended(): Promise<void> {
    this.notAttendedLoading.set(true);
    try {
      this.notAttended.set(
        await this.registrationService.listNotAttended(this.portalFilterParams())
      );
      this.notStartedPage.set(1);
      this.notStartedGoToPageInput.set('1');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not load not-started list');
    } finally {
      this.notAttendedLoading.set(false);
    }
  }

  setActiveTab(tab: ExamPortalTab): void {
    this.activeTab.set(tab);
    if (tab === 'results') void this.loadResults();
    if (tab === 'not-started') void this.loadNotAttended();
  }

  goClientPage(tab: ClientPagedTab, delta: number): void {
    const page = tab === 'results' ? this.resultsPage : this.notStartedPage;
    const totalPages = tab === 'results' ? this.resultsTotalPages() : this.notStartedTotalPages();
    const next = page() + delta;
    if (next < 1 || next > totalPages) return;
    page.set(next);
    this.syncClientGoToInput(tab);
  }

  goClientFirstPage(tab: ClientPagedTab): void {
    const page = tab === 'results' ? this.resultsPage : this.notStartedPage;
    if (page() === 1) return;
    page.set(1);
    this.syncClientGoToInput(tab);
  }

  goClientLastPage(tab: ClientPagedTab): void {
    const page = tab === 'results' ? this.resultsPage : this.notStartedPage;
    const last = tab === 'results' ? this.resultsTotalPages() : this.notStartedTotalPages();
    if (page() === last) return;
    page.set(last);
    this.syncClientGoToInput(tab);
  }

  onClientGoToPageInput(tab: ClientPagedTab, value: string): void {
    const input = tab === 'results' ? this.resultsGoToPageInput : this.notStartedGoToPageInput;
    input.set(value.replace(/\D/g, ''));
  }

  goClientToPage(tab: ClientPagedTab): void {
    const page = tab === 'results' ? this.resultsPage : this.notStartedPage;
    const input = tab === 'results' ? this.resultsGoToPageInput : this.notStartedGoToPageInput;
    const totalPages = tab === 'results' ? this.resultsTotalPages() : this.notStartedTotalPages();
    const parsed = Number(input());
    if (!parsed || Number.isNaN(parsed)) {
      this.syncClientGoToInput(tab);
      return;
    }
    const target = Math.min(Math.max(1, parsed), totalPages);
    page.set(target);
    this.syncClientGoToInput(tab);
  }

  onClientPageSizeChange(tab: ClientPagedTab, value: string): void {
    const size = Number(value);
    if (!size || size < 1) return;
    if (tab === 'results') {
      this.resultsPageSize.set(size);
      this.resultsPage.set(1);
    } else {
      this.notStartedPageSize.set(size);
      this.notStartedPage.set(1);
    }
    this.syncClientGoToInput(tab);
  }

  private syncClientGoToInput(tab: ClientPagedTab): void {
    if (tab === 'results') {
      this.resultsGoToPageInput.set(String(this.resultsPage()));
    } else {
      this.notStartedGoToPageInput.set(String(this.notStartedPage()));
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
      await this.loadPortalStats();
      await this.loadRegistrations();
      await this.loadResults();
      await this.loadNotAttended();
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
      await this.loadPortalStats();
      await this.loadRegistrations();
      await this.loadResults();
      await this.loadNotAttended();
      this.toast.success('All registrations deleted');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      this.deleting.set(false);
    }
  }

  async sendAllPendingEmails(): Promise<void> {
    await this.runBatchedCredentialSend({});
  }

  async sendFilteredEmails(): Promise<void> {
    if (this.emailFilter() === 'sent') {
      this.toast.error('Filter is “Email sent” — switch to pending or all to send credentials.');
      return;
    }
    await this.runBatchedCredentialSend({
      examId: this.examFilter() || undefined
    });
  }

  openAddStudentModal(): void {
    this.addStudentEmail.set('');
    this.addStudentName.set('');
    this.addStudentRoleSlug.set(this.roleOptions[0]?.slug ?? '');
    this.addStudentSendEmail.set(true);
    this.addStudentOpen.set(true);
  }

  closeAddStudentModal(): void {
    if (this.addStudentSubmitting()) return;
    this.addStudentOpen.set(false);
  }

  async submitAddStudent(): Promise<void> {
    const email = this.addStudentEmail().trim().toLowerCase();
    const fullName = this.addStudentName().trim();
    const role = this.roleOptions.find((r) => r.slug === this.addStudentRoleSlug());

    if (!email || !fullName || !role) {
      this.toast.error('Email, name, and role are required');
      return;
    }

    this.addStudentSubmitting.set(true);
    try {
      await this.registrationService.addSingleRegistration({
        email,
        fullName,
        roleInterested: role.name,
        sendCredentials: this.addStudentSendEmail()
      });
      this.toast.success(
        this.addStudentSendEmail()
          ? `Registered ${fullName} and sent credentials`
          : `Registered ${fullName} (email not sent)`
      );
      this.addStudentOpen.set(false);
      await this.loadPortalStats();
      await this.loadRegistrations();
      await this.loadNotAttended();
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not add student');
    } finally {
      this.addStudentSubmitting.set(false);
    }
  }

  closeSendModal(): void {
    if (this.sendPhase() === 'sending') return;
    this.sendModalOpen.set(false);
    this.sendPhase.set('idle');
  }

  private async runBatchedCredentialSend(params: { examId?: string }): Promise<void> {
    this.sending.set(true);
    this.sendModalOpen.set(true);
    this.sendPhase.set('sending');
    this.sendProcessed.set(0);
    this.sendSentCount.set(0);
    this.sendFailedCount.set(0);
    this.sendErrorMessage.set('');

    try {
      const initialPending = await this.registrationService.countPendingCredentials(params);
      this.sendTotal.set(initialPending);

      if (initialPending === 0) {
        this.sendPhase.set('success');
        this.toast.success('No pending credential emails');
        return;
      }

      await this.tickUi();

      const maxIterations = Math.ceil(initialPending / EMAIL_SEND_BATCH_SIZE) + 10;
      for (let i = 0; i < maxIterations; i++) {
        const remaining = await this.registrationService.countPendingCredentials(params);
        if (remaining === 0) {
          this.sendProcessed.set(this.sendTotal());
          break;
        }

        const result = await this.registrationService.sendCredentials({
          examId: params.examId,
          onlyUnsent: true
        });

        if (result.summary.total === 0) {
          break;
        }

        this.storeTempPasswords(result.results);
        this.sendSentCount.update((n) => n + result.summary.sent);
        this.sendFailedCount.update((n) => n + result.summary.failed);

        const stillPending = await this.registrationService.countPendingCredentials(params);
        this.sendProcessed.set(Math.max(0, this.sendTotal() - stillPending));
        await this.tickUi();
      }

      this.sendPhase.set('success');
      await this.loadPortalStats();
      await this.loadRegistrations();
      this.toast.success(
        `${this.sendSentCount()} emails sent, ${this.sendFailedCount()} failed (${this.sendProcessed()} of ${this.sendTotal()} registrations)`
      );
    } catch (err) {
      this.sendPhase.set('error');
      this.sendErrorMessage.set(err instanceof Error ? err.message : 'Send failed');
      this.toast.error(this.sendErrorMessage());
    } finally {
      this.sending.set(false);
      this.cdr.markForCheck();
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

  formatExportDateTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  }

  async exportRegistrations(): Promise<void> {
    try {
      const rows = await this.registrationService.listAllRegistrations({
        search: this.search(),
        roleSlug: this.roleFilter() || undefined,
        emailStatus: this.emailFilter(),
        examId: this.examFilter() || undefined,
        assignmentFilter: this.assignmentFilter(),
        multiExamFilter: this.multiExamFilter()
      });
      if (rows.length === 0) {
        this.toast.error('No registrations to export');
        return;
      }

      const columns = [
        { id: 'name', label: 'Name' },
        { id: 'email', label: 'Email' },
        { id: 'role', label: 'Role interested' },
        { id: 'roleSlug', label: 'Role slug' },
        { id: 'exam', label: 'Assigned exam' },
        { id: 'emailStatus', label: 'Email status' },
        { id: 'multiRole', label: 'Multiple roles import' },
        { id: 'credentialsSentAt', label: 'Credentials sent at (IST)' },
        { id: 'provisionError', label: 'Provision error' },
        { id: 'registeredAt', label: 'Registered at (IST)' }
      ];

      downloadAdminTableXlsx(
        rows,
        columns,
        columns.map((c) => c.id),
        `exam-registrations-${this.roleFilter() || 'all'}`,
        (row, col) => {
          switch (col) {
            case 'name':
              return row.fullName;
            case 'email':
              return row.email;
            case 'role':
              return row.roleInterested;
            case 'roleSlug':
              return row.roleSlug ?? '';
            case 'exam':
              return row.examTitle ?? '';
            case 'emailStatus':
              return this.emailStatusLabel(row);
            case 'multiRole':
              return row.fromMultipleRoles ? 'Yes' : 'No';
            case 'credentialsSentAt':
              return this.formatExportDateTime(row.credentialsSentAt);
            case 'provisionError':
              return row.provisionError ?? '';
            case 'registeredAt':
              return this.formatExportDateTime(row.createdAt);
            default:
              return '';
          }
        }
      );
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  }

  exportNotStarted(): void {
    const rows = this.notAttended();
    if (rows.length === 0) {
      this.toast.error('No not-started rows to export');
      return;
    }

    const columns = [
      { id: 'name', label: 'Name' },
      { id: 'email', label: 'Email' },
      { id: 'role', label: 'Role interested' },
      { id: 'roleSlug', label: 'Role slug' },
      { id: 'exam', label: 'Assigned exam' },
      { id: 'credentialsSentAt', label: 'Credentials sent at (IST)' },
      { id: 'registeredAt', label: 'Registered at (IST)' }
    ];

    downloadAdminTableXlsx(
      rows,
      columns,
      columns.map((c) => c.id),
      `exam-not-started-${this.roleFilter() || 'all'}`,
      (row, col) => {
        switch (col) {
          case 'name':
            return row.fullName;
          case 'email':
            return row.email;
          case 'role':
            return row.roleInterested;
          case 'roleSlug':
            return row.roleSlug ?? '';
          case 'exam':
            return row.examTitle ?? '';
          case 'credentialsSentAt':
            return this.formatExportDateTime(row.credentialsSentAt);
          case 'registeredAt':
            return this.formatExportDateTime(row.createdAt);
          default:
            return '';
        }
      }
    );
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
    if (rows.length === 0) {
      this.toast.error('No results to export');
      return;
    }

    const columns = [
      { id: 'resultId', label: 'Result ID' },
      { id: 'attemptId', label: 'Attempt ID' },
      { id: 'examId', label: 'Exam ID' },
      { id: 'userId', label: 'User ID' },
      { id: 'name', label: 'Name' },
      { id: 'email', label: 'Email' },
      { id: 'role', label: 'Role slug' },
      { id: 'attemptStatus', label: 'Attempt status' },
      { id: 'startedAt', label: 'Started at (IST)' },
      { id: 'submittedAt', label: 'Submitted at (IST)' },
      { id: 'attemptEndsAt', label: 'Attempt ends at (IST)' },
      { id: 'mcq', label: 'MCQ score' },
      { id: 'mcqMax', label: 'MCQ max' },
      { id: 'coding', label: 'Coding score' },
      { id: 'codingMax', label: 'Coding max' },
      { id: 'total', label: 'Total score' },
      { id: 'totalMax', label: 'Total max' },
      { id: 'pct', label: 'Percentage' },
      { id: 'warnings', label: 'Fullscreen warnings' },
      { id: 'evaluatedAt', label: 'Evaluated at (IST)' }
    ];

    downloadAdminTableXlsx(
      rows,
      columns,
      columns.map((c) => c.id),
      `exam-results-${this.roleFilter() || 'all'}`,
      (row, col) => {
        switch (col) {
          case 'resultId':
            return row.id;
          case 'attemptId':
            return row.attemptId;
          case 'examId':
            return row.examId;
          case 'userId':
            return row.userId;
          case 'name':
            return row.studentName;
          case 'email':
            return row.studentEmail;
          case 'role':
            return row.roleSlug;
          case 'attemptStatus':
            return row.attemptStatus ?? '';
          case 'startedAt':
            return this.formatExportDateTime(row.attemptStartedAt);
          case 'submittedAt':
            return this.formatExportDateTime(row.attemptSubmittedAt);
          case 'attemptEndsAt':
            return this.formatExportDateTime(row.attemptEndsAt);
          case 'mcq':
            return String(row.mcqScore);
          case 'mcqMax':
            return String(row.mcqMax);
          case 'coding':
            return String(row.codingScore);
          case 'codingMax':
            return String(row.codingMax);
          case 'total':
            return String(row.totalScore);
          case 'totalMax':
            return String(row.totalMax);
          case 'pct':
            return String(row.percentage);
          case 'warnings':
            return String(row.fullscreenWarnings);
          case 'evaluatedAt':
            return this.formatExportDateTime(row.evaluatedAt);
          default:
            return '';
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

  private async tickUi(): Promise<void> {
    this.cdr.markForCheck();
    await this.flushUi();
  }
}
