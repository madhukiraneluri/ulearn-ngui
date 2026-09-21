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
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast';

@Component({
  selector: 'app-exam-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './exam-login.html',
  styleUrl: './exam-login.scss'
})
export class ExamLogin implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  form!: FormGroup;
  showPassword = false;
  returnUrl = '/exam/dashboard';

  readonly isLoading = this.auth.isLoading;
  readonly submitting = signal(false);

  ngOnInit(): void {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/exam/dashboard';
    void this.redirectIfAlreadySignedIn();
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  private async redirectIfAlreadySignedIn(): Promise<void> {
    const isAuthenticated = await this.auth.ensureSessionChecked();
    if (!isAuthenticated) return;

    if (this.auth.isAdmin()) {
      await this.router.navigateByUrl('/admin/dashboard', { replaceUrl: true });
      return;
    }

    if (!this.auth.isExamOnly()) {
      await this.router.navigateByUrl('/', { replaceUrl: true });
      return;
    }

    await this.router.navigateByUrl(this.examLandingUrl(), { replaceUrl: true });
  }

  private examLandingUrl(): string {
    if (this.auth.mustResetPassword()) return '/exam/set-password';
    return this.returnUrl;
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    try {
      const { email, password } = this.form.value;
      const success = await this.auth.signIn(email, password, { silent: true });
      if (!success) return;

      if (!this.auth.isExamOnly()) {
        await this.auth.signOut('/exam/login');
        this.toast.error('This login is for exam candidates only.');
        return;
      }

      await this.router.navigateByUrl(this.examLandingUrl(), { replaceUrl: true });
    } finally {
      this.submitting.set(false);
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.form.get(fieldName);
    return !!(control?.invalid && control.touched);
  }
}
