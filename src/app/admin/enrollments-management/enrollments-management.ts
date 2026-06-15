import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminCourseService, AdminCourseRow } from '../services/admin-course.service';
import {
  AdminEnrollmentsService,
  CourseEnrollmentRow,
  CourseEnrollmentSummary
} from '../services/admin-enrollments.service';
import {
  AdminModuleUnlocksService,
  CourseModuleOption,
  EnrollmentUnlockRow
} from '../services/admin-module-unlocks.service';
import { EnrollmentBulkImportService } from '../services/enrollment-bulk-import.service';
import { AuthService } from '../../core/services/auth.service';
import {
  BULK_ENROLL_HELP,
  BulkEnrollRowResult
} from '../services/enrollment-bulk-import.util';
import { ToastService } from '../../core/services/toast';
import { AdminTableToolbar } from '../components/admin-table-toolbar/admin-table-toolbar';
import {
  AdminTableColumnDef,
  defaultVisibleColumnIds
} from '../utils/admin-table.types';
import { downloadAdminTableXlsx } from '../utils/admin-table-export.util';

type EnrollmentsTab = 'enrollments' | 'unlocks';

const ENROLLMENT_COLUMNS: readonly AdminTableColumnDef[] = [
  { id: 'name', label: 'Name' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'college', label: 'College', defaultVisible: false },
  { id: 'specialization', label: 'Specialization', defaultVisible: false },
  { id: 'degree', label: 'Degree', defaultVisible: false },
  { id: 'year', label: 'Year', defaultVisible: false },
  { id: 'liveClass', label: 'Live class start', defaultVisible: false },
  { id: 'enrolledAt', label: 'Enrolled' },
  { id: 'progress', label: 'Progress %' },
  { id: 'coupon', label: 'Coupon', defaultVisible: false },
  { id: 'amountPaid', label: 'Amount paid', defaultVisible: false },
  { id: 'actions', label: 'Actions', exportable: false }
];

const UNLOCK_BASE_COLUMNS: readonly AdminTableColumnDef[] = [
  { id: 'name', label: 'Student' },
  { id: 'email', label: 'Email' },
  { id: 'liveClass', label: 'Live class start' }
];

@Component({
  selector: 'app-enrollments-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, AdminTableToolbar],
  templateUrl: './enrollments-management.html',
  styleUrl: './enrollments-management.scss'
})
export class EnrollmentsManagement implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly courseService = inject(AdminCourseService);
  private readonly enrollmentsService = inject(AdminEnrollmentsService);
  private readonly unlocksService = inject(AdminModuleUnlocksService);
  private readonly bulkImportService = inject(EnrollmentBulkImportService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly bulkHelp = BULK_ENROLL_HELP;
  readonly enrollmentColumnDefs = ENROLLMENT_COLUMNS;
  readonly activeTab = signal<EnrollmentsTab>('enrollments');

  readonly courses = signal<AdminCourseRow[]>([]);
  readonly selectedCourseId = signal<string | null>(null);
  readonly summary = signal<CourseEnrollmentSummary | null>(null);
  readonly isLoading = signal(true);
  readonly showBulkModal = signal(false);
  readonly bulkFile = signal<File | null>(null);
  readonly bulkImporting = signal(false);
  readonly bulkResults = signal<BulkEnrollRowResult[] | null>(null);

  readonly failedBulkResults = signal<BulkEnrollRowResult[]>([]);
  readonly courseModules = signal<CourseModuleOption[]>([]);
  readonly unlockRows = signal<EnrollmentUnlockRow[]>([]);
  readonly togglingUnlock = signal<string | null>(null);
  readonly togglingModuleAll = signal<string | null>(null);

  readonly enrollmentVisibleColumns = signal<string[]>(
    defaultVisibleColumnIds(ENROLLMENT_COLUMNS)
  );
  readonly unlockVisibleColumns = signal<string[]>(
    defaultVisibleColumnIds(UNLOCK_BASE_COLUMNS)
  );

  readonly unlockColumnDefs = computed(() => [
    ...UNLOCK_BASE_COLUMNS,
    ...this.courseModules().map((m, index) => ({
      id: `mod_${m.id}`,
      label: `M${m.order} unlocked`,
      defaultVisible: index === 0
    }))
  ]);

  ngOnInit(): void {
    void this.initPage();
  }

  private async initPage(): Promise<void> {
    this.isLoading.set(true);
    const list = await this.courseService.listAll();
    this.courses.set(list);

    const qp = this.route.snapshot.queryParamMap.get('courseId');
    const initial = qp && list.some((c) => c.id === qp) ? qp : list[0]?.id ?? null;
    if (initial) {
      this.selectedCourseId.set(initial);
      await this.loadEnrollments(initial);
    }
    this.isLoading.set(false);
  }

  async onCourseChange(event: Event): Promise<void> {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedCourseId.set(id);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { courseId: id },
      queryParamsHandling: 'merge'
    });
    await this.loadEnrollments(id);
  }

  private async loadEnrollments(courseId: string): Promise<void> {
    const [data, modules, unlocks] = await Promise.all([
      this.enrollmentsService.getEnrollmentsForCourse(courseId),
      this.unlocksService.getModulesForCourse(courseId),
      this.unlocksService.getEnrollmentUnlocks(courseId)
    ]);
    this.summary.set(data);
    this.courseModules.set(modules);
    this.unlockRows.set(unlocks);
    this.unlockVisibleColumns.set(
      defaultVisibleColumnIds([
        ...UNLOCK_BASE_COLUMNS,
        ...modules.map((m, index) => ({
          id: `mod_${m.id}`,
          label: `M${m.order} unlocked`,
          defaultVisible: index === 0
        }))
      ])
    );
  }

  setTab(tab: EnrollmentsTab): void {
    this.activeTab.set(tab);
  }

  isEnrollmentColVisible(id: string): boolean {
    return this.enrollmentVisibleColumns().includes(id);
  }

  isUnlockColVisible(id: string): boolean {
    return this.unlockVisibleColumns().includes(id);
  }

  isUnlockModuleColVisible(moduleId: string): boolean {
    return this.isUnlockColVisible(`mod_${moduleId}`);
  }

  selectedCourseTitle(): string {
    const id = this.selectedCourseId();
    return this.courses().find((c) => c.id === id)?.title ?? '';
  }

  downloadEnrollments(): void {
    const rows = this.summary()?.enrollments ?? [];
    if (rows.length === 0) {
      this.toast.error('No enrollment data to download');
      return;
    }
    const slug = this.selectedCourseTitle().replace(/[^\w]+/g, '_') || 'course';
    downloadAdminTableXlsx(
      rows,
      ENROLLMENT_COLUMNS,
      this.enrollmentVisibleColumns(),
      `${slug}_enrollments`,
      (row, col) => this.enrollmentCellValue(row, col)
    );
    this.toast.success('Download started');
  }

  downloadUnlocks(): void {
    const rows = this.unlockRows();
    if (rows.length === 0) {
      this.toast.error('No unlock data to download');
      return;
    }
    const slug = this.selectedCourseTitle().replace(/[^\w]+/g, '_') || 'course';
    downloadAdminTableXlsx(
      rows,
      this.unlockColumnDefs(),
      this.unlockVisibleColumns(),
      `${slug}_content_unlocks`,
      (row, col) => this.unlockCellValue(row, col)
    );
    this.toast.success('Download started');
  }

  private enrollmentCellValue(row: CourseEnrollmentRow, columnId: string): string {
    switch (columnId) {
      case 'name':
        return row.name;
      case 'email':
        return row.email ?? '';
      case 'phone':
        return row.phone ?? '';
      case 'college':
        return row.collegeName ?? '';
      case 'specialization':
        return row.specialization ?? '';
      case 'degree':
        return row.degree ?? '';
      case 'year':
        return row.degreeYear != null ? String(row.degreeYear) : '';
      case 'liveClass':
        return this.formatLiveClassMonth(row.liveClassStartMonth);
      case 'enrolledAt':
        return this.formatDate(row.enrolledAt);
      case 'progress':
        return `${row.progressPercent}%`;
      case 'coupon':
        return row.couponCodeUsed ?? '';
      case 'amountPaid':
        return row.amountPaid != null ? String(row.amountPaid) : '';
      default:
        return '';
    }
  }

  private unlockCellValue(row: EnrollmentUnlockRow, columnId: string): string {
    if (columnId === 'name') return row.name;
    if (columnId === 'email') return row.email ?? '';
    if (columnId === 'liveClass') return this.formatLiveClassMonth(row.liveClassStartMonth);
    if (columnId.startsWith('mod_')) {
      const moduleId = columnId.slice(4);
      return row.unlockedModuleIds.includes(moduleId) ? 'Yes' : 'No';
    }
    return '';
  }

  openBulkModal(): void {
    this.bulkFile.set(null);
    this.bulkResults.set(null);
    this.failedBulkResults.set([]);
    this.showBulkModal.set(true);
  }

  closeBulkModal(): void {
    this.showBulkModal.set(false);
  }

  downloadSample(): void {
    this.bulkImportService.downloadSampleExcel(this.selectedCourseTitle());
  }

  onBulkFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.bulkFile.set(file);
    this.bulkResults.set(null);
    this.failedBulkResults.set([]);
    (event.target as HTMLInputElement).value = '';
  }

  async runBulkImport(): Promise<void> {
    const courseId = this.selectedCourseId();
    const file = this.bulkFile();
    if (!courseId) {
      this.toast.error('Select a course first');
      return;
    }
    if (!file) {
      this.toast.error('Choose an Excel file (.xlsx)');
      return;
    }

    this.bulkImporting.set(true);
    this.bulkResults.set(null);
    this.failedBulkResults.set([]);

    try {
      const rows = await this.bulkImportService.parseExcelFile(file);
      const results = await this.bulkImportService.importEmails(courseId, rows);
      this.bulkResults.set(results);
      this.failedBulkResults.set(results.filter((r) => !r.success));

      const ok = results.filter((r) => r.success).length;
      const fail = results.length - ok;
      await this.loadEnrollments(courseId);

      if (fail === 0) {
        this.toast.success(`Enrolled ${ok} user(s)`);
        this.closeBulkModal();
      } else if (ok === 0) {
        this.toast.error(`No enrollments — ${fail} row(s) failed`);
      } else {
        this.toast.success(`Enrolled ${ok}; ${fail} could not be enrolled`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      this.toast.error(msg);
    } finally {
      this.bulkImporting.set(false);
    }
  }

  async removeEnrollment(enrollmentId: string, name: string): Promise<void> {
    if (!confirm(`Remove enrollment for ${name}?`)) return;

    const courseId = this.selectedCourseId();
    const ok = await this.enrollmentsService.removeEnrollment(enrollmentId);
    if (ok) {
      this.toast.success('Enrollment removed');
      if (courseId) await this.loadEnrollments(courseId);
    } else {
      this.toast.error('Could not remove enrollment');
    }
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return iso;
    }
  }

  formatLiveClassMonth(value: string | null): string {
    if (!value) return '—';
    const [year, month] = value.split('-');
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  formatYear(year: number | null): string {
    if (year == null) return '—';
    const labels = ['', '1st', '2nd', '3rd', '4th', '5th'];
    return labels[year] ? `${labels[year]} Year` : String(year);
  }

  isModuleUnlocked(row: EnrollmentUnlockRow, moduleId: string): boolean {
    return row.unlockedModuleIds.includes(moduleId);
  }

  unlockKey(enrollmentId: string, moduleId: string): string {
    return `${enrollmentId}:${moduleId}`;
  }

  isAllUnlockedForModule(moduleId: string): boolean {
    const rows = this.unlockRows();
    return rows.length > 0 && rows.every((r) => r.unlockedModuleIds.includes(moduleId));
  }

  isSomeUnlockedForModule(moduleId: string): boolean {
    const rows = this.unlockRows();
    const count = rows.filter((r) => r.unlockedModuleIds.includes(moduleId)).length;
    return count > 0 && count < rows.length;
  }

  isModuleAllBusy(moduleId: string): boolean {
    return this.togglingModuleAll() === moduleId;
  }

  async toggleAllForModule(moduleId: string, checked: boolean): Promise<void> {
    const rows = this.unlockRows();
    if (rows.length === 0) return;

    this.togglingModuleAll.set(moduleId);
    const admin = this.auth.currentUser();
    let ok: boolean;

    if (checked) {
      const enrollmentIds = rows
        .filter((r) => !r.unlockedModuleIds.includes(moduleId))
        .map((r) => r.enrollmentId);
      ok = await this.unlocksService.unlockModuleForEnrollments(
        enrollmentIds,
        moduleId,
        admin?.id ?? ''
      );
    } else {
      const enrollmentIds = rows
        .filter((r) => r.unlockedModuleIds.includes(moduleId))
        .map((r) => r.enrollmentId);
      ok = await this.unlocksService.lockModuleForEnrollments(enrollmentIds, moduleId);
    }

    this.togglingModuleAll.set(null);

    if (ok) {
      const courseId = this.selectedCourseId();
      if (courseId) await this.loadEnrollments(courseId);
      this.toast.success(
        checked ? 'Module unlocked for all students' : 'Module locked for all students'
      );
    } else {
      this.toast.error('Could not update module access for all students');
    }
  }

  async toggleModuleUnlock(
    row: EnrollmentUnlockRow,
    moduleId: string,
    checked: boolean
  ): Promise<void> {
    const key = this.unlockKey(row.enrollmentId, moduleId);
    this.togglingUnlock.set(key);

    const admin = this.auth.currentUser();
    let ok: boolean;

    if (checked) {
      ok = await this.unlocksService.unlockModule(
        row.enrollmentId,
        moduleId,
        admin?.id ?? ''
      );
    } else {
      ok = await this.unlocksService.lockModule(row.enrollmentId, moduleId);
    }

    this.togglingUnlock.set(null);

    if (ok) {
      const courseId = this.selectedCourseId();
      if (courseId) await this.loadEnrollments(courseId);
      this.toast.success(checked ? 'Module unlocked' : 'Module locked');
    } else {
      this.toast.error('Could not update module access');
    }
  }
}
