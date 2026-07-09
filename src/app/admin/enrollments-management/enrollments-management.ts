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
import { ActivatedRoute, Router } from '@angular/router';
import { AdminCourseService, AdminCourseRow } from '../services/admin-course.service';
import {
  AdminEnrollmentsService,
  CourseEnrollmentRow
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
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { AdminCourseMultiFilter } from '../components/admin-course-multi-filter/admin-course-multi-filter';
import { AdminTableToolbar } from '../components/admin-table-toolbar/admin-table-toolbar';
import {
  AdminTableColumnDef,
  defaultVisibleColumnIds
} from '../utils/admin-table.types';
import { downloadAdminTableXlsx } from '../utils/admin-table-export.util';

type EnrollmentsTab = 'enrollments' | 'unlocks';

const ENROLLMENT_COLUMNS: readonly AdminTableColumnDef[] = [
  { id: 'name', label: 'Name' },
  { id: 'course', label: 'Course' },
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
  imports: [CommonModule, FormsModule, AdminTableToolbar, AdminCourseMultiFilter],
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
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly bulkHelp = BULK_ENROLL_HELP;
  readonly enrollmentColumnDefs = ENROLLMENT_COLUMNS;
  readonly activeTab = signal<EnrollmentsTab>('enrollments');

  readonly courses = signal<AdminCourseRow[]>([]);
  readonly allEnrollments = signal<CourseEnrollmentRow[]>([]);
  readonly selectedCourseIds = signal<string[]>([]);
  readonly studentSearch = signal('');
  readonly isLoading = signal(true);
  readonly isDeletingUser = signal(false);
  readonly showBulkModal = signal(false);
  readonly bulkFile = signal<File | null>(null);
  readonly bulkImporting = signal(false);
  readonly bulkResults = signal<BulkEnrollRowResult[] | null>(null);
  readonly failedBulkResults = signal<BulkEnrollRowResult[]>([]);
  readonly bulkCourseId = signal('');

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

  readonly unlockCourseId = computed(() => {
    const ids = this.selectedCourseIds();
    return ids.length === 1 ? ids[0] : null;
  });

  readonly filteredEnrollments = computed(() => {
    const courseIds = this.selectedCourseIds();
    const q = this.studentSearch().trim().toLowerCase();
    let rows = this.allEnrollments();

    if (courseIds.length > 0) {
      const set = new Set(courseIds);
      rows = rows.filter((r) => set.has(r.courseId));
    }

    if (!q) return rows;

    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.courseTitle.toLowerCase().includes(q) ||
        (r.email?.toLowerCase().includes(q) ?? false) ||
        (r.phone?.toLowerCase().includes(q) ?? false)
    );
  });

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
    const [list, enrollments] = await Promise.all([
      this.courseService.listAll(),
      this.enrollmentsService.getAllEnrollments()
    ]);
    this.courses.set(list);
    this.allEnrollments.set(enrollments);

    const qp = this.route.snapshot.queryParamMap.get('courseId');
    if (qp && list.some((c) => c.id === qp)) {
      this.selectedCourseIds.set([qp]);
      await this.loadUnlocksForCourse(qp);
    }

    this.isLoading.set(false);
  }

  async onCourseFilterChange(ids: string[]): Promise<void> {
    this.selectedCourseIds.set(ids);
    const courseId = ids.length === 1 ? ids[0] : null;
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { courseId: courseId ?? null },
      queryParamsHandling: 'merge'
    });
    if (courseId) {
      await this.loadUnlocksForCourse(courseId);
    } else {
      this.courseModules.set([]);
      this.unlockRows.set([]);
    }
  }

  private async loadAllEnrollments(): Promise<void> {
    const enrollments = await this.enrollmentsService.getAllEnrollments();
    this.allEnrollments.set(enrollments);
  }

  private async loadUnlocksForCourse(courseId: string): Promise<void> {
    const [modules, unlocks] = await Promise.all([
      this.unlocksService.getModulesForCourse(courseId),
      this.unlocksService.getEnrollmentUnlocks(courseId)
    ]);
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

  onStudentSearchChange(value: string): void {
    this.studentSearch.set(value);
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

  unlockCourseTitle(): string {
    const id = this.unlockCourseId();
    return this.courses().find((c) => c.id === id)?.title ?? '';
  }

  downloadEnrollments(): void {
    const rows = this.filteredEnrollments();
    if (rows.length === 0) {
      this.toast.error('No enrollment data to download');
      return;
    }
    downloadAdminTableXlsx(
      rows,
      ENROLLMENT_COLUMNS,
      this.enrollmentVisibleColumns(),
      'all_enrollments',
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
    const slug = this.unlockCourseTitle().replace(/[^\w]+/g, '_') || 'course';
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
      case 'course':
        return row.courseTitle;
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
    const courseId = this.unlockCourseId() ?? this.courses()[0]?.id ?? '';
    this.bulkCourseId.set(courseId);
    this.bulkFile.set(null);
    this.bulkResults.set(null);
    this.failedBulkResults.set([]);
    this.showBulkModal.set(true);
  }

  closeBulkModal(): void {
    this.showBulkModal.set(false);
  }

  downloadSample(): void {
    const course = this.courses().find((c) => c.id === this.bulkCourseId());
    this.bulkImportService.downloadSampleExcel(course?.title ?? 'course');
  }

  onBulkFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.bulkFile.set(file);
    this.bulkResults.set(null);
    this.failedBulkResults.set([]);
    (event.target as HTMLInputElement).value = '';
  }

  async runBulkImport(): Promise<void> {
    const courseId = this.bulkCourseId();
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
      await this.loadAllEnrollments();
      if (this.unlockCourseId() === courseId) {
        await this.loadUnlocksForCourse(courseId);
      }

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

  async removeEnrollment(row: CourseEnrollmentRow): Promise<void> {
    if (
      !(await this.confirmDialog.confirm({
        title: 'Remove enrollment',
        message: `Remove ${row.name}'s enrollment in "${row.courseTitle}"?`,
        confirmLabel: 'Remove',
        variant: 'danger'
      }))
    ) {
      return;
    }

    const ok = await this.enrollmentsService.removeEnrollment(row.enrollmentId);
    if (ok) {
      this.toast.success('Enrollment removed');
      await this.loadAllEnrollments();
      const courseId = this.unlockCourseId();
      if (courseId) await this.loadUnlocksForCourse(courseId);
    } else {
      this.toast.error('Could not remove enrollment');
    }
  }

  async deleteUser(row: CourseEnrollmentRow): Promise<void> {
    const label = row.email ? `${row.name} (${row.email})` : row.name;
    if (
      !(await this.confirmDialog.confirm({
        title: 'Delete user',
        message: `Delete user ${label}?\n\nThis removes their account, all enrollments, and progress. This cannot be undone.`,
        confirmLabel: 'Delete user',
        variant: 'danger'
      }))
    ) {
      return;
    }

    this.isDeletingUser.set(true);
    try {
      await this.enrollmentsService.deleteUser(row.userId);
      this.toast.success('User deleted');
      await this.loadAllEnrollments();
      const courseId = this.unlockCourseId();
      if (courseId) await this.loadUnlocksForCourse(courseId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not delete user';
      this.toast.error(msg);
    } finally {
      this.isDeletingUser.set(false);
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
      const courseId = this.unlockCourseId();
      if (courseId) await this.loadUnlocksForCourse(courseId);
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
      const courseId = this.unlockCourseId();
      if (courseId) await this.loadUnlocksForCourse(courseId);
      this.toast.success(checked ? 'Module unlocked' : 'Module locked');
    } else {
      this.toast.error('Could not update module access');
    }
  }
}
