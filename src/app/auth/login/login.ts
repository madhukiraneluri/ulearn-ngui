import {
  Component,
  ChangeDetectionStrategy,
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
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService as SupabaseAuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(SupabaseAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  form!: FormGroup;
  showPassword = false;
  returnUrl: string = '/';

  readonly isLoading = this.auth.isLoading;

  ngOnInit(): void {
    this.initializeForm();
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';
  }

  initializeForm(): void {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    const { email, password } = this.form.value;
    const success = await this.auth.signIn(email, password);

    if (success) {
      await this.router.navigateByUrl(this.returnUrl || '/');
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.form.get(fieldName);
    return !!(control?.invalid && control.touched);
  }

  getErrorMessage(fieldName: string): string {
    const control = this.form.get(fieldName);

    if (!control || !control.errors) {
      return '';
    }

    if (control.errors['required']) {
      return fieldName === 'email' ? 'Email is required' : 'Password is required';
    }

    if (control.errors['email']) {
      return 'Please enter a valid email address';
    }

    return 'Invalid input';
  }
}
