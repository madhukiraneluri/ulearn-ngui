import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { DiscountCoupon } from '../../models';
import { AdminCouponsService } from '../services/admin-coupons.service';
import { ToastService } from '../../core/services/toast';
import { AdminTableToolbar } from '../components/admin-table-toolbar/admin-table-toolbar';
import {
  AdminTableColumnDef,
  defaultVisibleColumnIds
} from '../utils/admin-table.types';
import { downloadAdminTableXlsx } from '../utils/admin-table-export.util';

const COUPON_COLUMNS: readonly AdminTableColumnDef[] = [
  { id: 'code', label: 'Code' },
  { id: 'discount', label: 'Discount %' },
  { id: 'status', label: 'Status' },
  { id: 'usage', label: 'Usage' },
  { id: 'expires', label: 'Expires' },
  { id: 'actions', label: 'Actions', exportable: false }
];

@Component({
  selector: 'app-discount-coupons-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, AdminTableToolbar],
  templateUrl: './discount-coupons-management.html',
  styleUrl: './discount-coupons-management.scss'
})
export class DiscountCouponsManagement implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly couponsService = inject(AdminCouponsService);
  private readonly toast = inject(ToastService);

  readonly coupons = signal<DiscountCoupon[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly showForm = signal(false);
  readonly columnDefs = COUPON_COLUMNS;
  readonly visibleColumns = signal<string[]>(defaultVisibleColumnIds(COUPON_COLUMNS));

  form!: FormGroup;

  ngOnInit(): void {
    this.form = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(3)]],
      discountPercentage: [10, [Validators.required, Validators.min(1), Validators.max(100)]],
      active: [true],
      expiresAt: [''],
      maxUses: ['']
    });
    void this.loadCoupons();
  }

  private async loadCoupons(): Promise<void> {
    this.isLoading.set(true);
    this.coupons.set(await this.couponsService.listAll());
    this.isLoading.set(false);
  }

  openCreate(): void {
    this.form.reset({
      code: '',
      discountPercentage: 10,
      active: true,
      expiresAt: '',
      maxUses: ''
    });
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
  }

  async saveCoupon(): Promise<void> {
    if (this.isSaving() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.value;
    this.isSaving.set(true);

    const created = await this.couponsService.create({
      code: v.code,
      discountPercentage: Number(v.discountPercentage),
      active: !!v.active,
      expiresAt: v.expiresAt || null,
      maxUses: v.maxUses ? Number(v.maxUses) : null
    });

    this.isSaving.set(false);

    if (created) {
      this.toast.success(`Coupon ${created.code} created`);
      this.closeForm();
      await this.loadCoupons();
    } else {
      this.toast.error('Could not create coupon');
    }
  }

  async toggleActive(coupon: DiscountCoupon): Promise<void> {
    const ok = await this.couponsService.toggleActive(coupon.id, !coupon.active);
    if (ok) {
      await this.loadCoupons();
    } else {
      this.toast.error('Could not update coupon');
    }
  }

  async deleteCoupon(coupon: DiscountCoupon): Promise<void> {
    if (!confirm(`Delete coupon ${coupon.code}?`)) return;

    const ok = await this.couponsService.delete(coupon.id);
    if (ok) {
      this.toast.success('Coupon deleted');
      await this.loadCoupons();
    } else {
      this.toast.error('Could not delete coupon');
    }
  }

  formatDate(iso?: string): string {
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

  isColVisible(id: string): boolean {
    return this.visibleColumns().includes(id);
  }

  downloadData(): void {
    const rows = this.coupons();
    if (rows.length === 0) {
      this.toast.error('No data to download');
      return;
    }
    downloadAdminTableXlsx(
      rows,
      COUPON_COLUMNS,
      this.visibleColumns(),
      'discount_coupons',
      (row, col) => {
        switch (col) {
          case 'code':
            return row.code;
          case 'discount':
            return String(row.discountPercentage);
          case 'status':
            return row.active ? 'Active' : 'Inactive';
          case 'usage':
            return row.maxUses ? `${row.usageCount}/${row.maxUses}` : String(row.usageCount);
          case 'expires':
            return this.formatDate(row.expiresAt);
          default:
            return '';
        }
      }
    );
    this.toast.success('Download started');
  }
}
