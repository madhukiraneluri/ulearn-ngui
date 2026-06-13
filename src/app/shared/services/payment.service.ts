import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '../../core/services/toast';

export interface PendingEnrollment {
  courseId: string;
  slug: string;
  price: number;
}

const PENDING_KEY = 'ul_pending_enrollment';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  setPendingEnrollment(data: PendingEnrollment): void {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(data));
  }

  getPendingEnrollment(): PendingEnrollment | null {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      return raw ? (JSON.parse(raw) as PendingEnrollment) : null;
    } catch {
      return null;
    }
  }

  clearPendingEnrollment(): void {
    sessionStorage.removeItem(PENDING_KEY);
  }

  /** Razorpay integration placeholder — keys will be wired later. */
  async startCheckout(pending: PendingEnrollment): Promise<boolean> {
    this.toast.info(
      `Payment gateway coming soon. Course: ${pending.slug} — ₹${pending.price.toLocaleString('en-IN')}`
    );
    // TODO: Load Razorpay script and open checkout with keys from environment
    return false;
  }

  async resumePendingPayment(): Promise<void> {
    const pending = this.getPendingEnrollment();
    if (!pending) return;

    await this.startCheckout(pending);
  }
}
