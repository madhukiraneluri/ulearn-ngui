import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

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
  selector: 'app-set-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './set-password.html',
  styleUrl: './set-password.scss'
})
export class SetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  form!: FormGroup;
  showPassword = false;
  showConfirmPassword = false;
  private submitting = false;

  readonly isLoading = this.auth.isLoading;

  ngOnInit(): void {
    this.form = this.fb.group(
      {
        password: ['', [Validators.required, passwordStrengthValidator]],
        confirmPassword: ['', [Validators.required]]
      },
      { validators: passwordMatchValidator }
    );

    void this.ensureAccess();
  }

  private async ensureAccess(): Promise<void> {
    const loggedIn = await this.auth.ensureSessionChecked();
    if (!loggedIn) {
      await this.router.navigate(['/auth/login']);
      return;
    }
    if (!this.auth.mustResetPassword()) {
      await this.router.navigate(
        this.auth.hasCompletedProfile() ? ['/'] : ['/auth/complete-profile']
      );
    }
  }

  async onSubmit(): Promise<void> {
    if (this.submitting || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;
    try {
      const password = String(this.form.get('password')?.value);
      const ok = await this.auth.setNewPassword(password);
      if (!ok) return;

      await this.router.navigate(
        this.auth.hasCompletedProfile() ? ['/'] : ['/auth/complete-profile']
      );
    } finally {
      this.submitting = false;
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.form.get(fieldName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  hasPasswordMismatch(): boolean {
    return !!(
      this.form.errors?.['passwordMismatch'] &&
      this.form.get('confirmPassword')?.touched
    );
  }
}
