import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectorRef,
  signal
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast';
import { LegalModalService } from '../../core/services/legal-modal.service';
import { LegalPolicyId } from '../../shared/constants/legal';

function passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
  const value = (control.value as string) ?? '';
  if (!value) return null;

  const errors: ValidationErrors = {};
  if (value.length < 8) errors['minLength'] = true;
  if (!/[A-Z]/.test(value)) errors['uppercase'] = true;
  if (!/[a-z]/.test(value)) errors['lowercase'] = true;
  if (!/[0-9]/.test(value)) errors['number'] = true;

  return Object.keys(errors).length ? errors : null;
}

function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;

  if (!password || !confirmPassword) return null;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-signup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrl: './signup.scss'
})
export class SignupComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly legalModal = inject(LegalModalService);
  private readonly toast = inject(ToastService);

  form!: FormGroup;
  showPassword = false;
  showConfirmPassword = false;

  readonly isLoading = this.auth.isLoading;
  readonly emailVerified = signal(false);
  readonly codeSent = signal(false);
  readonly resendIn = signal(0);
  private verificationToken = '';
  private verifiedEmail = '';
  private resendTimer: ReturnType<typeof setInterval> | null = null;
  private submitting = false;

  ngOnInit(): void {
    this.initializeForm();
  }

  ngOnDestroy(): void {
    if (this.resendTimer) clearInterval(this.resendTimer);
  }

  private initializeForm(): void {
    this.form = this.fb.group(
      {
        fullName: [
          '',
          [
            Validators.required,
            Validators.minLength(2),
            Validators.maxLength(80),
            Validators.pattern(/^[a-zA-Z\s.'-]+$/)
          ]
        ],
        email: ['', [Validators.required, Validators.email]],
        otp: [''],
        phoneNumber: [
          '',
          [
            Validators.required,
            Validators.pattern(/^[0-9]{10,15}$/)
          ]
        ],
        password: ['', [Validators.required, passwordStrengthValidator]],
        confirmPassword: ['', [Validators.required]],
        acceptTerms: [false, [Validators.requiredTrue]]
      },
      { validators: passwordMatchValidator }
    );
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  onEmailChanged(): void {
    const email = this.normalizedEmail();
    if (email !== this.verifiedEmail) {
      this.emailVerified.set(false);
      this.verificationToken = '';
    }
    this.cdr.markForCheck();
  }

  async sendCode(): Promise<void> {
    const emailControl = this.form.get('email');
    emailControl?.markAsTouched();
    if (emailControl?.invalid || this.isLoading() || this.resendIn() > 0) {
      this.cdr.markForCheck();
      return;
    }

    const sent = await this.auth.requestSignupOtp(this.normalizedEmail());
    if (sent) {
      this.codeSent.set(true);
      this.emailVerified.set(false);
      this.verificationToken = '';
      this.startResendCooldown();
    }
    this.cdr.markForCheck();
  }

  async verifyCode(): Promise<void> {
    const code = String(this.form.get('otp')?.value ?? '').trim();
    if (!/^\d{6}$/.test(code) || this.isLoading()) {
      this.form.get('otp')?.markAsTouched();
      this.form.get('otp')?.setErrors({ otp: true });
      this.cdr.markForCheck();
      return;
    }

    const token = await this.auth.verifySignupOtp(this.normalizedEmail(), code);
    if (!token) {
      this.cdr.markForCheck();
      return;
    }

    this.verificationToken = token;
    this.verifiedEmail = this.normalizedEmail();
    this.emailVerified.set(true);
    this.form.get('otp')?.setErrors(null);
    this.cdr.markForCheck();
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    this.cdr.markForCheck();

    if (this.form.invalid) return;
    if (!this.emailVerified() || this.normalizedEmail() !== this.verifiedEmail) {
      this.emailVerified.set(false);
      this.toast.error('Verify your email with the code we sent before creating an account.');
      this.cdr.markForCheck();
      return;
    }
    if (this.submitting || this.isLoading()) return;

    this.submitting = true;
    try {
      const { fullName, email, password, phoneNumber } = this.form.getRawValue();
      const success = await this.auth.signUp(
        email.trim(),
        password,
        fullName.trim(),
        phoneNumber.trim(),
        this.verificationToken
      );

      if (success) {
        await this.router.navigate(['/']);
      }
    } finally {
      this.submitting = false;
      this.cdr.markForCheck();
    }
  }

  private normalizedEmail(): string {
    return String(this.form.get('email')?.value ?? '').trim().toLowerCase();
  }

  private startResendCooldown(): void {
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendIn.set(60);
    this.resendTimer = setInterval(() => {
      const next = this.resendIn() - 1;
      this.resendIn.set(next);
      if (next <= 0 && this.resendTimer) {
        clearInterval(this.resendTimer);
        this.resendTimer = null;
      }
      this.cdr.markForCheck();
    }, 1000);
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.form.get(fieldName);
    return !!(control?.invalid && control.touched);
  }

  hasPasswordMismatch(): boolean {
    return !!(
      this.form.errors?.['passwordMismatch'] &&
      this.form.get('confirmPassword')?.touched
    );
  }

  passwordRequirementMet(type: 'length' | 'upper' | 'lower' | 'number'): boolean {
    const value = (this.form.get('password')?.value as string) ?? '';
    switch (type) {
      case 'length': return value.length >= 8;
      case 'upper': return /[A-Z]/.test(value);
      case 'lower': return /[a-z]/.test(value);
      case 'number': return /[0-9]/.test(value);
    }
  }

  getErrorMessage(fieldName: string): string {
    const control = this.form.get(fieldName);
    if (!control?.errors) return '';

    const errors = control.errors;

    if (errors['required']) {
      const labels: Record<string, string> = {
        fullName: 'Full name is required',
        phoneNumber: 'Phone number is required',
        email: 'Email is required',
        password: 'Password is required',
        confirmPassword: 'Please confirm your password',
        acceptTerms: 'You must accept the terms to continue'
      };
      return labels[fieldName] ?? 'This field is required';
    }

    if (errors['email']) return 'Please enter a valid email address';
    if (errors['otp']) return 'Enter the 6-digit code from your email';
    if (errors['pattern'] && fieldName === 'phoneNumber') return 'Please enter a valid 10-15 digit phone number';
    if (errors['minlength']) return 'Name must be at least 2 characters';
    if (errors['maxlength']) return 'Name must be 80 characters or less';
    if (errors['pattern']) return 'Name can only contain letters, spaces, and . \' -';

    if (fieldName === 'password') {
      if (errors['minLength']) return 'Password must be at least 8 characters';
      if (errors['uppercase']) return 'Include at least one uppercase letter';
      if (errors['lowercase']) return 'Include at least one lowercase letter';
      if (errors['number']) return 'Include at least one number';
    }

    return 'Invalid input';
  }

  openLegal(policyId: LegalPolicyId, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.legalModal.open(policyId);
  }
}
