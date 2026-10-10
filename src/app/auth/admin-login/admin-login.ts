import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.scss'
})
export class AdminLogin implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  form!: FormGroup;
  showPassword = false;

  readonly isLoading = this.auth.isLoading;

  ngOnInit(): void {
    void this.redirectIfAlreadyAdmin();
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });
  }

  private async redirectIfAlreadyAdmin(): Promise<void> {
    if (await this.auth.ensureSessionChecked()) {
      if (this.auth.canAccessPortal()) {
        await this.router.navigate(
          this.auth.mustResetPassword() ? ['/auth/set-password'] : ['/admin/dashboard']
        );
      }
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { email, password } = this.form.value;
    const success = await this.auth.signIn(email, password, { silent: true });

    if (!success) return;

    if (!this.auth.canAccessPortal()) {
      await this.auth.signOut('/auth/admin');
      this.toast.error('Access denied. This account cannot open the admin panel.');
      return;
    }

    if (this.auth.mustResetPassword()) {
      this.toast.info('Set a new password to continue.');
      await this.router.navigate(['/auth/set-password']);
      return;
    }

    this.toast.success('Welcome');
    await this.router.navigate(['/admin/dashboard']);
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.form.get(fieldName);
    return !!(control?.invalid && control.touched);
  }
}
