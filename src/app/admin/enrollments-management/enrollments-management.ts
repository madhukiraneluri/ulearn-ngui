import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminCourseService, AdminCourseRow } from '../services/admin-course.service';
import {
  AdminEnrollmentsService,
  CourseEnrollmentSummary
} from '../services/admin-enrollments.service';
import { EnrollmentBulkImportService } from '../services/enrollment-bulk-import.service';
import {
  BULK_ENROLL_HELP,
  BulkEnrollRowResult
} from '../services/enrollment-bulk-import.util';
import { ToastService } from '../../core/services/toast';

@Component({
  selector: 'app-enrollments-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './enrollments-management.html',
  styleUrl: './enrollments-management.scss'
})
export class EnrollmentsManagement implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly courseService = inject(AdminCourseService);
  private readonly enrollmentsService = inject(AdminEnrollmentsService);
  private readonly bulkImportService = inject(EnrollmentBulkImportService);
  private readonly toast = inject(ToastService);

  readonly bulkHelp = BULK_ENROLL_HELP;

  readonly courses = signal<AdminCourseRow[]>([]);
  readonly selectedCourseId = signal<string | null>(null);
  readonly summary = signal<CourseEnrollmentSummary | null>(null);
  readonly isLoading = signal(true);
  readonly showBulkModal = signal(false);
  readonly bulkFile = signal<File | null>(null);
  readonly bulkImporting = signal(false);
  readonly bulkResults = signal<BulkEnrollRowResult[] | null>(null);

  readonly failedBulkResults = signal<BulkEnrollRowResult[]>([]);

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
    const data = await this.enrollmentsService.getEnrollmentsForCourse(courseId);
    this.summary.set(data);
  }

  selectedCourseTitle(): string {
    const id = this.selectedCourseId();
    return this.courses().find((c) => c.id === id)?.title ?? '';
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
}
