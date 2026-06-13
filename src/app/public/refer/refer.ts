import { ChangeDetectionStrategy, Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../core/services/toast';
import { AuthService } from '../../core/services/auth.service';

interface ReferralUser {
  name: string;
  email: string;
  joinedDate: string;
  status: 'pending' | 'joined';
}

@Component({
  selector: 'app-refer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './refer.html',
  styleUrl: './refer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Refer {
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  // Signals
  readonly referralCode = signal('REF' + Math.random().toString(36).substring(2, 8).toUpperCase());
  readonly referredCount = signal(0);
  readonly earnedAmount = signal(0);
  readonly referredUsers = signal<ReferralUser[]>([]);

  // Computed
  readonly referralLink = computed(() => `${window.location.origin}?ref=${this.referralCode()}`);
  readonly totalEarnings = computed(() => this.referredCount() * 500); // 500 per referral

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.toast.success('Referral link copied!');
    }).catch(() => {
      this.toast.error('Failed to copy link');
    });
  }

  shareViaWhatsApp(): void {
    const message = `Hey! 👋 Join ULearn and explore amazing courses and internships. Use my referral code: ${this.referralCode()} to get exclusive benefits! 🎓`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  shareViaEmail(): void {
    const subject = 'Join ULearn with My Referral Code';
    const body = `Hey!%0A%0AJoin ULearn and explore amazing courses and internships.%0A%0AUse my referral code: ${this.referralCode()}%0A%0ABenefits:%0A- Get exclusive discounts%0A- Access premium content%0A- Join our learning community%0A%0AHere's my referral link: ${this.referralLink()}%0A%0AThanks!`;
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  shareViaTwitter(): void {
    const message = `Just discovered @ULearn - Amazing courses & internships! 🎓 Join with my referral: ${this.referralCode()}. Both get exclusive benefits! 🎁 #Learning #FutureOfEducation`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }
}
