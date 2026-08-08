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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AdminBatchesService,
  AdminBatchRow,
  BatchMemberDetailRow
} from '../services/admin-batches.service';
import {
  AdminStudentsService,
  StudentPickerOption
} from '../services/admin-students.service';
import { ToastService } from '../../core/services/toast';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { AdminTableToolbar } from '../components/admin-table-toolbar/admin-table-toolbar';
import {
  AdminTableColumnDef,
  defaultVisibleColumnIds
} from '../utils/admin-table.types';
import { downloadAdminTableXlsx } from '../utils/admin-table-export.util';

const MEMBER_COLUMNS: readonly AdminTableColumnDef[] = [
  { id: 'name', label: 'Name' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone', defaultVisible: false },
  { id: 'college', label: 'College', defaultVisible: false },
  { id: 'degree', label: 'Degree', defaultVisible: false },
  { id: 'year', label: 'Year', defaultVisible: false },
  { id: 'specialization', label: 'Specialization', defaultVisible: false },
  { id: 'enrolledAt', label: 'Enrolled' },
  { id: 'liveClass', label: 'Live class start', defaultVisible: false },
  { id: 'progress', label: 'Progress %' },
  { id: 'coupon', label: 'Coupon', defaultVisible: false },
  { id: 'amountPaid', label: 'Amount paid', defaultVisible: false },
  { id: 'addedToBatch', label: 'Added to batch', defaultVisible: false },
  { id: 'actions', label: 'Actions', exportable: false }
];

@Component({
  selector: 'app-batch-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, AdminTableToolbar],
  templateUrl: './batch-detail.html',
  styleUrl: './batch-detail.scss'
})
export class BatchDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly batchesService = inject(AdminBatchesService);
  private readonly studentsService = inject(AdminStudentsService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly batch = signal<AdminBatchRow | null>(null);
  readonly members = signal<BatchMemberDetailRow[]>([]);
  readonly isLoading = signal(true);
  readonly memberSearch = signal('');
  readonly columnDefs = MEMBER_COLUMNS;
  readonly visibleColumns = signal<string[]>(defaultVisibleColumnIds(MEMBER_COLUMNS));

  readonly showAddStudentsModal = signal(false);
  readonly studentOptions = signal<StudentPickerOption[]>([]);
  readonly selectedStudentIds = signal<string[]>([]);
  readonly studentSearchQuery = signal('');
  readonly isAddingStudents = signal(false);
  readonly loadingStudentOptions = signal(false);

  readonly filteredMembers = computed(() => {
    const q = this.memberSearch().trim().toLowerCase();
    const list = this.members();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.userName.toLowerCase().includes(q) ||
        (m.userEmail?.toLowerCase().includes(q) ?? false) ||
        (m.phone?.toLowerCase().includes(q) ?? false) ||
        (m.collegeName?.toLowerCase().includes(q) ?? false)
    );
  });

  readonly filteredStudentOptions = computed(() => {
    const q = this.studentSearchQuery().trim().toLowerCase();
    const list = this.studentOptions();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.email?.toLowerCase().includes(q) ?? false)
    );
  });

  ngOnInit(): void {
    void this.load();
  }

  private batchId(): string {
    return this.route.snapshot.paramMap.get('batchId') ?? '';
  }

  private async load(): Promise<void> {
    const id = this.batchId();
    if (!id) {
      await this.router.navigate(['/admin/batches']);
      return;
    }

    this.isLoading.set(true);
    try {
      const [batch, members] = await Promise.all([
        this.batchesService.getById(id),
        this.batchesService.listMemberDetails(id)
      ]);

      if (!batch) {
        this.toast.error('Batch not found');
        await this.router.navigate(['/admin/batches']);
        return;
      }

      this.batch.set(batch);
      this.members.set(members);
    } finally {
      this.isLoading.set(false);
    }
  }

  isColVisible(id: string): boolean {
    return this.visibleColumns().includes(id);
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
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

  formatMoney(amount: number | null): string {
    if (amount == null) return '—';
    return `₹${amount.toLocaleString('en-IN')}`;
  }

  async openAddStudents(): Promise<void> {
    const batch = this.batch();
    if (!batch) return;

    this.selectedStudentIds.set([]);
    this.studentSearchQuery.set('');
    this.showAddStudentsModal.set(true);
    this.loadingStudentOptions.set(true);

    const [allStudents, currentMembers] = await Promise.all([
      this.studentsService.listStudentPickerOptions(),
      this.batchesService.listMembers(batch.id)
    ]);

    const memberIds = new Set(currentMembers.map((m) => m.userId));
    this.studentOptions.set(allStudents.filter((s) => !memberIds.has(s.id)));
    this.loadingStudentOptions.set(false);
  }

  closeAddStudentsModal(): void {
    this.showAddStudentsModal.set(false);
    this.selectedStudentIds.set([]);
    this.studentSearchQuery.set('');
  }

  toggleStudentSelection(studentId: string): void {
    const cur = this.selectedStudentIds();
    this.selectedStudentIds.set(
      cur.includes(studentId) ? cur.filter((id) => id !== studentId) : [...cur, studentId]
    );
  }

  isStudentSelected(studentId: string): boolean {
    return this.selectedStudentIds().includes(studentId);
  }

  async submitAddStudents(): Promise<void> {
    const batch = this.batch();
    const ids = this.selectedStudentIds();
    if (!batch || ids.length === 0) {
      this.toast.error('Select at least one student');
      return;
    }

    this.isAddingStudents.set(true);
    let ok = 0;
    let fail = 0;

    try {
      for (const userId of ids) {
        try {
          await this.studentsService.addStudentToBatch(userId, batch.id);
          ok++;
        } catch {
          fail++;
        }
      }

      if (ok === 0) {
        this.toast.error('Could not add students to batch');
      } else if (fail === 0) {
        this.toast.success(`Added ${ok} student(s)`);
      } else {
        this.toast.success(`Added ${ok}; ${fail} failed`);
      }

      this.closeAddStudentsModal();
      await this.load();
    } finally {
      this.isAddingStudents.set(false);
    }
  }

  async removeMember(member: BatchMemberDetailRow): Promise<void> {
    if (
      !(await this.confirmDialog.confirm({
        title: 'Remove from batch',
        message: `Remove ${member.userName} from this batch?`,
        confirmLabel: 'Remove',
        variant: 'danger'
      }))
    ) {
      return;
    }

    const ok = await this.batchesService.removeMember(member.memberId);
    if (ok) {
      this.toast.success('Removed from batch');
      await this.load();
    } else {
      this.toast.error('Could not remove member');
    }
  }

  async deleteBatch(): Promise<void> {
    const batch = this.batch();
    if (!batch) return;

    if (
      !(await this.confirmDialog.confirm({
        title: 'Delete batch',
        message: `Delete batch "${batch.name}"? Remove all students first.`,
        confirmLabel: 'Delete',
        variant: 'danger'
      }))
    ) {
      return;
    }

    const result = await this.batchesService.delete(batch.id);
    if (result.ok) {
      this.toast.success('Batch deleted');
      await this.router.navigate(['/admin/batches']);
    } else {
      this.toast.error(result.message ?? 'Could not delete batch');
    }
  }

  downloadData(): void {
    const rows = this.filteredMembers();
    if (rows.length === 0) {
      this.toast.error('No data to download');
      return;
    }
    const batchName = this.batch()?.name ?? 'batch';
    downloadAdminTableXlsx(
      rows,
      MEMBER_COLUMNS,
      this.visibleColumns(),
      `batch-${batchName}-members`,
      (row, col) => this.exportCell(row, col)
    );
    this.toast.success('Download started');
  }

  private exportCell(row: BatchMemberDetailRow, col: string): string {
    switch (col) {
      case 'name':
        return row.userName;
      case 'email':
        return row.userEmail ?? '';
      case 'phone':
        return row.phone ?? '';
      case 'college':
        return row.collegeName ?? '';
      case 'degree':
        return row.degree ?? '';
      case 'year':
        return row.degreeYear ?? '';
      case 'specialization':
        return row.specialization ?? '';
      case 'enrolledAt':
        return row.enrolledAt ? this.formatDate(row.enrolledAt) : '';
      case 'liveClass':
        return row.liveClassStartMonth ?? '';
      case 'progress':
        return String(row.progressPercent);
      case 'coupon':
        return row.couponCode ?? '';
      case 'amountPaid':
        return row.amountPaid != null ? String(row.amountPaid) : '';
      case 'addedToBatch':
        return this.formatDate(row.addedToBatchAt);
      default:
        return '';
    }
  }
}
