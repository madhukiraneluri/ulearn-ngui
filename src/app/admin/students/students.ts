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
import { ToastService } from '../../core/services/toast';
import { AdminTableToolbar } from '../components/admin-table-toolbar/admin-table-toolbar';
import {
  AdminTableColumnDef,
  defaultVisibleColumnIds
} from '../utils/admin-table.types';
import { downloadAdminTableXlsx } from '../utils/admin-table-export.util';

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
  imports: [CommonModule, FormsModule, AdminTableToolbar],
  templateUrl: './students.html',
  styleUrl: './students.scss'
})
export class Students implements OnInit {
  private readonly studentsService = inject(AdminStudentsService);
  private readonly toast = inject(ToastService);

  readonly students = signal<AdminStudentRow[]>([]);
  readonly recentEnrollments = signal<RecentEnrollmentRow[]>([]);
  readonly courses = signal<AdminCourseRow[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly searchQuery = signal('');
  readonly expandedStudentId = signal<string | null>(null);
  readonly showEnrollModal = signal(false);
  readonly enrollUserId = signal('');
  readonly enrollCourseId = signal('');
  readonly columnDefs = STUDENT_COLUMNS;
  readonly visibleColumns = signal<string[]>(defaultVisibleColumnIds(STUDENT_COLUMNS));

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

  ngOnInit(): void {
    void this.loadData();
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    const [students, recent, courses] = await Promise.all([
      this.studentsService.listStudents(),
      this.studentsService.listRecentEnrollments(8),
      this.studentsService.listCoursesForEnroll()
    ]);
    this.students.set(students);
    this.recentEnrollments.set(recent);
    this.courses.set(courses);
    this.isLoading.set(false);
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

  openEnrollModal(studentId?: string): void {
    this.enrollUserId.set(studentId ?? '');
    this.enrollCourseId.set(this.courses()[0]?.id ?? '');
    this.showEnrollModal.set(true);
  }

  closeEnrollModal(): void {
    this.showEnrollModal.set(false);
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

  async removeEnrollment(enrollmentId: string, studentName: string, courseTitle: string): Promise<void> {
    if (!confirm(`Remove enrollment for ${studentName} in "${courseTitle}"?`)) return;

    const ok = await this.studentsService.removeEnrollment(enrollmentId);
    if (ok) {
      this.toast.success('Enrollment removed');
      await this.loadData();
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
