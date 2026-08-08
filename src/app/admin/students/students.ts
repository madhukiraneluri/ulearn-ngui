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
import {
  AdminStudentsService,
  AdminStudentRow,
  RecentEnrollmentRow
} from '../services/admin-students.service';
import { AdminCourseRow } from '../services/admin-course.service';
import { AdminBatchesService, AdminBatchRow } from '../services/admin-batches.service';
import { StudentBulkImportService } from '../services/student-bulk-import.service';
import { ToastService } from '../../core/services/toast';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { ProfileLookupService } from '../../shared/services/profile-lookup.service';
import { AdminTableToolbar } from '../components/admin-table-toolbar/admin-table-toolbar';
import { AdminCourseSearchSelect } from '../components/admin-course-search-select/admin-course-search-select';
import { SearchableSelect } from '../../shared/components/searchable-select/searchable-select';
import {
  AdminTableColumnDef,
  defaultVisibleColumnIds
} from '../utils/admin-table.types';
import { downloadAdminTableXlsx } from '../utils/admin-table-export.util';
import type { CreateStudentRowResult } from '../services/student-provision.util';

const STUDENT_COLUMNS: readonly AdminTableColumnDef[] = [
  { id: 'name', label: 'Name' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'joined', label: 'Joined' },
  { id: 'enrollments', label: 'Enrollments' },
  { id: 'actions', label: 'Actions', exportable: false }
];

@Component({
  selector: 'app-students',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    AdminTableToolbar,
    AdminCourseSearchSelect,
    SearchableSelect
  ],
  templateUrl: './students.html',
  styleUrl: './students.scss'
})
export class Students implements OnInit {
  private readonly studentsService = inject(AdminStudentsService);
  private readonly batchesService = inject(AdminBatchesService);
  private readonly bulkImportService = inject(StudentBulkImportService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly profileLookup = inject(ProfileLookupService);

  readonly searchColleges = (q: string) => this.profileLookup.searchColleges(q);

  readonly students = signal<AdminStudentRow[]>([]);
  readonly recentEnrollments = signal<RecentEnrollmentRow[]>([]);
  readonly courses = signal<AdminCourseRow[]>([]);
  readonly batches = signal<AdminBatchRow[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly isDeletingUser = signal(false);
  readonly isResending = signal(false);
  readonly searchQuery = signal('');
  readonly expandedStudentId = signal<string | null>(null);
  readonly showEnrollModal = signal(false);
  readonly showAddModal = signal(false);
  readonly showBulkModal = signal(false);
  readonly enrollUserId = signal('');
  readonly enrollCourseId = signal('');
  readonly columnDefs = STUDENT_COLUMNS;
  readonly visibleColumns = signal<string[]>(defaultVisibleColumnIds(STUDENT_COLUMNS));

  readonly addFullName = signal('');
  readonly addEmail = signal('');
  readonly addPhone = signal('');
  readonly addCollege = signal('');
  readonly addOtherCollege = signal('');
  readonly addShowOtherCollege = signal(false);
  readonly addCourseSearchQuery = signal('');
  readonly bulkCourseSearchQuery = signal('');
  readonly addEnrollCourses = signal(false);
  readonly addAssignBatch = signal(false);
  readonly addCourseIds = signal<string[]>([]);
  readonly addBatchIds = signal<string[]>([]);
  readonly addCreateNewBatch = signal(false);
  readonly addNewBatchCourseId = signal<string | null>(null);
  readonly addNewBatchName = signal('');
  readonly addNewBatchStartDate = signal('');
  readonly addSendEmail = signal(true);
  readonly addResult = signal<{ email: string; tempPassword?: string; emailSent?: boolean } | null>(null);

  readonly bulkFile = signal<File | null>(null);
  readonly bulkImporting = signal(false);
  readonly bulkEnrollCourses = signal(false);
  readonly bulkAssignBatch = signal(false);
  readonly bulkCourseIds = signal<string[]>([]);
  readonly bulkBatchIds = signal<string[]>([]);
  readonly bulkCreateNewBatch = signal(false);
  readonly bulkNewBatchCourseId = signal<string | null>(null);
  readonly bulkNewBatchName = signal('');
  readonly bulkNewBatchStartDate = signal('');
  readonly bulkSendEmail = signal(true);
  readonly bulkResults = signal<CreateStudentRowResult[] | null>(null);

  readonly filteredStudents = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.students();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.email?.toLowerCase().includes(q) ?? false) ||
        (s.phone?.toLowerCase().includes(q) ?? false) ||
        s.id.toLowerCase().includes(q)
    );
  });

  readonly totalEnrollments = computed(() =>
    this.students().reduce((sum, s) => sum + s.enrollmentCount, 0)
  );

  readonly batchOptions = computed(() => {
    const courseFilter = new Set([
      ...this.addCourseIds(),
      ...(this.addNewBatchCourseId() ? [this.addNewBatchCourseId()!] : [])
    ]);
    const list = this.batches();
    if (courseFilter.size === 0) return list;
    return list.filter((b) => courseFilter.has(b.courseId));
  });

  readonly bulkBatchOptions = computed(() => {
    const courseFilter = new Set([
      ...this.bulkCourseIds(),
      ...(this.bulkNewBatchCourseId() ? [this.bulkNewBatchCourseId()!] : [])
    ]);
    const list = this.batches();
    if (courseFilter.size === 0) return list;
    return list.filter((b) => courseFilter.has(b.courseId));
  });

  readonly filteredCoursesForAdd = computed(() =>
    this.filterCoursesBySearch(this.courses(), this.addCourseSearchQuery())
  );

  readonly filteredCoursesForBulk = computed(() =>
    this.filterCoursesBySearch(this.courses(), this.bulkCourseSearchQuery())
  );

  private filterCoursesBySearch(courses: AdminCourseRow[], query: string): AdminCourseRow[] {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q)
    );
  }

  ngOnInit(): void {
    void this.loadData();
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const [students, recent, courses, batches] = await Promise.all([
        this.studentsService.listStudents(),
        this.studentsService.listRecentEnrollments(8),
        this.studentsService.listCoursesForEnroll(),
        this.batchesService.listAll()
      ]);
      this.students.set(students);
      this.recentEnrollments.set(recent);
      this.courses.set(courses);
      this.batches.set(batches);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load students';
      this.loadError.set(msg);
      console.error('Students.loadData:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  retryLoad(): void {
    void this.loadData();
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
  }

  toggleExpand(studentId: string): void {
    this.expandedStudentId.update((cur) => (cur === studentId ? null : studentId));
  }

  isExpanded(studentId: string): boolean {
    return this.expandedStudentId() === studentId;
  }

  openAddModal(): void {
    this.resetAddForm();
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
    this.addResult.set(null);
  }

  private resetAddForm(): void {
    this.addFullName.set('');
    this.addEmail.set('');
    this.addPhone.set('');
    this.addCollege.set('');
    this.addOtherCollege.set('');
    this.addShowOtherCollege.set(false);
    this.addCourseSearchQuery.set('');
    this.addEnrollCourses.set(false);
    this.addAssignBatch.set(false);
    this.addCourseIds.set([]);
    this.addBatchIds.set([]);
    this.addCreateNewBatch.set(false);
    this.addNewBatchCourseId.set(this.courses()[0]?.id ?? null);
    this.addNewBatchName.set('');
    this.addNewBatchStartDate.set('');
    this.addSendEmail.set(true);
    this.addResult.set(null);
  }

  openBulkModal(): void {
    this.bulkFile.set(null);
    this.bulkResults.set(null);
    this.bulkEnrollCourses.set(false);
    this.bulkAssignBatch.set(false);
    this.bulkCourseIds.set([]);
    this.bulkBatchIds.set([]);
    this.bulkCreateNewBatch.set(false);
    this.bulkNewBatchCourseId.set(this.courses()[0]?.id ?? null);
    this.bulkNewBatchName.set('');
    this.bulkNewBatchStartDate.set('');
    this.bulkSendEmail.set(true);
    this.bulkCourseSearchQuery.set('');
    this.showBulkModal.set(true);
  }

  closeBulkModal(): void {
    this.showBulkModal.set(false);
  }

  openEnrollModal(studentId?: string): void {
    this.enrollUserId.set(studentId ?? '');
    this.enrollCourseId.set(this.courses()[0]?.id ?? '');
    this.showEnrollModal.set(true);
  }

  closeEnrollModal(): void {
    this.showEnrollModal.set(false);
  }

  toggleBatchSelection(batchId: string, mode: 'add' | 'bulk'): void {
    if (mode === 'add') {
      const cur = this.addBatchIds();
      this.addBatchIds.set(
        cur.includes(batchId) ? cur.filter((id) => id !== batchId) : [...cur, batchId]
      );
    } else {
      const cur = this.bulkBatchIds();
      this.bulkBatchIds.set(
        cur.includes(batchId) ? cur.filter((id) => id !== batchId) : [...cur, batchId]
      );
    }
  }

  onAddCollegeChange(value: string): void {
    this.addCollege.set(value);
    this.addShowOtherCollege.set(value === 'Other');
    if (value !== 'Other') {
      this.addOtherCollege.set('');
    }
  }

  private resolvedAddCollegeName(): string | undefined {
    const college = this.addCollege().trim();
    if (!college) return undefined;
    if (college === 'Other') {
      const other = this.addOtherCollege().trim();
      return other || undefined;
    }
    return college;
  }

  toggleCourseSelection(courseId: string, mode: 'add' | 'bulk'): void {
    if (mode === 'add') {
      const cur = this.addCourseIds();
      this.addCourseIds.set(
        cur.includes(courseId) ? cur.filter((id) => id !== courseId) : [...cur, courseId]
      );
    } else {
      const cur = this.bulkCourseIds();
      this.bulkCourseIds.set(
        cur.includes(courseId) ? cur.filter((id) => id !== courseId) : [...cur, courseId]
      );
    }
  }

  isCourseSelected(courseId: string, mode: 'add' | 'bulk'): boolean {
    return mode === 'add'
      ? this.addCourseIds().includes(courseId)
      : this.bulkCourseIds().includes(courseId);
  }

  isBatchSelected(batchId: string, mode: 'add' | 'bulk'): boolean {
    return mode === 'add'
      ? this.addBatchIds().includes(batchId)
      : this.bulkBatchIds().includes(batchId);
  }

  async submitAddStudent(): Promise<void> {
    const email = this.addEmail().trim().toLowerCase();
    const fullName = this.addFullName().trim();
    if (!email || !fullName) {
      this.toast.error('Name and email are required');
      return;
    }

    if (this.addEnrollCourses() && this.addCourseIds().length === 0) {
      this.toast.error('Select at least one course to enroll');
      return;
    }

    if (this.addAssignBatch() && this.addCreateNewBatch()) {
      if (!this.addNewBatchCourseId() || !this.addNewBatchName().trim()) {
        this.toast.error('New batch needs a course and name');
        return;
      }
    }

    this.isSaving.set(true);
    this.addResult.set(null);
    try {
      const payload = {
        students: [
          {
            email,
            fullName,
            phone: this.addPhone().trim() || undefined,
            collegeName: this.resolvedAddCollegeName()
          }
        ],
        courseIds: this.addEnrollCourses() ? this.addCourseIds() : [],
        batchIds: this.addAssignBatch() && !this.addCreateNewBatch() ? this.addBatchIds() : [],
        newBatch:
          this.addAssignBatch() && this.addCreateNewBatch() && this.addNewBatchCourseId()
            ? {
                courseId: this.addNewBatchCourseId()!,
                name: this.addNewBatchName().trim(),
                startDate: this.addNewBatchStartDate() || undefined
              }
            : null,
        sendEmail: this.addSendEmail()
      };

      const response = await this.studentsService.createStudents(payload);
      const row = response.results[0];
      if (!row?.success) {
        this.toast.error(row?.message ?? 'Could not create student');
        return;
      }

      this.addResult.set({
        email: row.email,
        tempPassword: row.tempPassword,
        emailSent: row.emailSent
      });
      this.toast.success(row.message);
      await this.loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add student';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
    }
  }

  onBulkFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.bulkFile.set(file ?? null);
    this.bulkResults.set(null);
  }

  downloadBulkSample(): void {
    this.bulkImportService.downloadSampleExcel();
  }

  async submitBulkAdd(): Promise<void> {
    const file = this.bulkFile();
    if (!file) {
      this.toast.error('Choose an Excel file');
      return;
    }

    if (this.bulkAssignBatch() && this.bulkCreateNewBatch()) {
      if (!this.bulkNewBatchCourseId() || !this.bulkNewBatchName().trim()) {
        this.toast.error('New batch needs a course and name');
        return;
      }
    }

    this.bulkImporting.set(true);
    this.bulkResults.set(null);
    try {
      const rows = await this.bulkImportService.parseExcelFile(file);
      const results = await this.bulkImportService.importStudents(rows, {
        courseIds: this.bulkEnrollCourses() ? this.bulkCourseIds() : [],
        batchIds: this.bulkAssignBatch() && !this.bulkCreateNewBatch() ? this.bulkBatchIds() : [],
        newBatch:
          this.bulkAssignBatch() && this.bulkCreateNewBatch()
            ? {
                courseId: this.bulkNewBatchCourseId() ?? '',
                name: this.bulkNewBatchName().trim(),
                startDate: this.bulkNewBatchStartDate() || undefined
              }
            : null,
        sendEmail: this.bulkSendEmail()
      });
      this.bulkResults.set(results);
      const ok = results.filter((r) => r.success).length;
      const fail = results.length - ok;
      if (ok === 0) {
        this.toast.error(`No students created — ${fail} failed`);
      } else if (fail === 0) {
        this.toast.success(`Created ${ok} student(s)`);
      } else {
        this.toast.success(`Created ${ok}; ${fail} failed`);
      }
      await this.loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bulk import failed';
      this.toast.error(msg);
    } finally {
      this.bulkImporting.set(false);
    }
  }

  async submitManualEnroll(): Promise<void> {
    const userId = this.enrollUserId();
    const courseId = this.enrollCourseId();
    if (!userId || !courseId) {
      this.toast.error('Select a student and course');
      return;
    }

    this.isSaving.set(true);
    try {
      await this.studentsService.manualEnroll(userId, courseId);
      this.toast.success('Student enrolled');
      this.closeEnrollModal();
      await this.loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Enroll failed';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
    }
  }

  async resendCredentials(student: AdminStudentRow): Promise<void> {
    this.isResending.set(true);
    try {
      const result = await this.studentsService.resendCredentials(student.id);
      if (result.emailSent) {
        this.toast.success('Credentials emailed to student');
      } else if (result.tempPassword) {
        this.toast.success(`Email not sent. Temp password: ${result.tempPassword}`);
      } else {
        this.toast.error(result.emailError ?? 'Could not resend credentials');
      }
      await this.loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Resend failed';
      this.toast.error(msg);
    } finally {
      this.isResending.set(false);
    }
  }

  async removeEnrollment(enrollmentId: string, studentName: string, courseTitle: string): Promise<void> {
    if (
      !(await this.confirmDialog.confirm({
        title: 'Remove enrollment',
        message: `Remove enrollment for ${studentName} in "${courseTitle}"?`,
        confirmLabel: 'Remove',
        variant: 'danger'
      }))
    ) {
      return;
    }

    const ok = await this.studentsService.removeEnrollment(enrollmentId);
    if (ok) {
      this.toast.success('Enrollment removed');
      await this.loadData();
    } else {
      this.toast.error('Could not remove enrollment');
    }
  }

  async deleteUser(student: AdminStudentRow): Promise<void> {
    const label = student.email ? `${student.name} (${student.email})` : student.name;
    if (
      !(await this.confirmDialog.confirm({
        title: 'Delete user',
        message: `Delete user ${label}?\n\nThis removes their account, all enrollments, batches, and progress. This cannot be undone.`,
        confirmLabel: 'Delete user',
        variant: 'danger'
      }))
    ) {
      return;
    }

    this.isDeletingUser.set(true);
    try {
      await this.studentsService.deleteUser(student.id);
      this.toast.success('User deleted');
      await this.loadData();
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

  isColVisible(id: string): boolean {
    return this.visibleColumns().includes(id);
  }

  visibleColumnCount(): number {
    return this.visibleColumns().length;
  }

  downloadData(): void {
    const rows = this.filteredStudents();
    if (rows.length === 0) {
      this.toast.error('No data to download');
      return;
    }
    downloadAdminTableXlsx(
      rows,
      STUDENT_COLUMNS,
      this.visibleColumns(),
      'students',
      (row, col) => {
        switch (col) {
          case 'name':
            return row.name;
          case 'email':
            return row.email ?? '';
          case 'phone':
            return row.phone ?? '';
          case 'joined':
            return this.formatDate(row.joinedAt);
          case 'enrollments':
            return String(row.enrollmentCount);
          default:
            return '';
        }
      }
    );
    this.toast.success('Download started');
  }
}
