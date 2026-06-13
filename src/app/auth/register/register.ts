import {
  Component, ChangeDetectionStrategy, signal, inject
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RegisterRequest } from '../../models';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast';

interface RegisterForm extends RegisterRequest {
  confirmPassword: string;
}

@Component({
  selector: 'app-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.scss'
})
export class Register {
  private readonly router = inject(Router);
  private readonly auth   = inject(AuthService);
  private readonly toast  = inject(ToastService);

  readonly form = signal<RegisterForm>({
    name: '', email: '', password: '',
    confirmPassword: '', phone: ''
  });

  readonly showPassword = signal(false);
  readonly isLoading    = this.auth.isLoading;
  private submitting = false;

  update(field: keyof RegisterForm, val: string): void {
    this.form.update(f => ({ ...f, [field]: val }));
  }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  async submit(): Promise<void> {
    if (this.submitting || this.isLoading()) return;
    this.submitting = true;
    try {
      const { name, email, password, confirmPassword, phone } = this.form();

      if (!name || !email || !password) {
        this.toast.error('Please fill in all required fields.');
        return;
      }

      if (password !== confirmPassword) {
        this.toast.error('Passwords do not match.');
        return;
      }

      if (password.length < 8) {
        this.toast.error('Password must be at least 8 characters.');
        return;
      }

      // Use supabase signUp
      const success = await this.auth.signUp(email, password, name, phone);
      if (success) {
        this.toast.success('Account created successfully! Redirecting to dashboard.');
        this.router.navigate(['/']);
      } else {
        this.toast.error('Registration failed. Please try again.');
      }
    } finally {
      this.submitting = false;
    }
  }
}