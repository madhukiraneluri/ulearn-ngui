import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '../../core/services/toast';
import { AuthService } from '../../core/services/auth.service';
import { CourseService } from './course.service';
import { supabase } from '../../core/supabase.client';
import { environment } from '../../../environments/environment';

export interface PendingEnrollment {
  courseId: string;
  slug: string;
  price: number;
  title?: string;
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: string, handler: (response: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const PENDING_KEY = 'ul_pending_enrollment';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly courseService = inject(CourseService);

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

  /** Razorpay modal locks body scroll — restore after close. */
  unlockPageScroll(): void {
    document.body.classList.remove('razorpay-body');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('position');
    document.body.style.removeProperty('height');
    document.body.style.removeProperty('top');
    document.body.style.removeProperty('width');
    document.documentElement.style.removeProperty('overflow');
    document.documentElement.classList.remove('razorpay-body');
  }

  private loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay'));
      document.body.appendChild(script);
    });
  }

  async startCheckout(pending: PendingEnrollment): Promise<boolean> {
    const user = this.auth.currentUser();
    if (!user) {
      this.toast.error('Please log in to enroll');
      return false;
    }

    if (pending.price <= 0) {
      return this.enrollFree(pending);
    }

    try {
      await this.loadRazorpayScript();
    } catch {
      this.toast.error('Could not load payment gateway');
      return false;
    }

    const amountPaise = Math.round(pending.price * 100);
    const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
      body: { courseId: pending.courseId, amount: amountPaise }
    });

    if (error || !data?.orderId) {
      console.error('create-razorpay-order error:', error, data);
      this.toast.error(data?.error || 'Could not create payment order');
      return false;
    }

    const profile = this.auth.profile();
    const userName =
      profile?.full_name ||
      (user.user_metadata?.['full_name'] as string | undefined) ||
      user.email.split('@')[0];

    return new Promise((resolve) => {
      const options: Record<string, unknown> = {
        key: environment.razorpayKeyId,
        amount: data.amount,
        currency: data.currency,
        name: environment.appName,
        description: pending.title || `Course enrollment`,
        order_id: data.orderId,
        handler: (response: RazorpayResponse) => {
          void this.verifyAndEnroll(pending, response).then(resolve);
        },
        prefill: {
          name: userName,
          email: user.email
        },
        theme: { color: '#8B6FBE' },
        modal: {
          ondismiss: () => {
            this.unlockPageScroll();
            resolve(false);
          }
        }
      };

      const rzp = new window.Razorpay!(options);
      rzp.on('payment.failed', (res) => {
        this.unlockPageScroll();
        this.toast.error(res.error?.description || 'Payment failed');
        resolve(false);
      });
      rzp.open();
    });
  }

  private async verifyAndEnroll(
    pending: PendingEnrollment,
    response: RazorpayResponse
  ): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke('verify-razorpay-payment', {
      body: {
        courseId: pending.courseId,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature
      }
    });

    if (error || !data?.success) {
      console.error('verify-razorpay-payment error:', error, data);
      this.unlockPageScroll();
      this.toast.error(data?.error || 'Payment verification failed');
      return false;
    }

    this.clearPendingEnrollment();
    this.unlockPageScroll();
    this.toast.success('Payment successful! You are now enrolled.');
    await this.router.navigate(['/my-courses']);
    return true;
  }

  private async enrollFree(pending: PendingEnrollment): Promise<boolean> {
    const user = this.auth.currentUser();
    if (!user) return false;

    const ok = await this.courseService.enrollUser(pending.courseId, user.id);
    if (!ok) {
      this.toast.error('Enrollment failed');
      return false;
    }

    this.clearPendingEnrollment();
    this.toast.success('Enrolled successfully!');
    await this.router.navigate(['/my-courses']);
    return true;
  }

  async resumePendingPayment(): Promise<void> {
    const pending = this.getPendingEnrollment();
    if (!pending) return;
    await this.startCheckout(pending);
  }
}
