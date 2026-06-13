import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  ChangeDetectorRef
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast';
import { ProfileLookupService } from '../../shared/services/profile-lookup.service';
import { SearchableSelect } from '../../shared/components/searchable-select/searchable-select';
import { SearchableMultiSelect } from '../../shared/components/searchable-multi-select/searchable-multi-select';
import { supabase, type UserProfile } from '../../core/supabase.client';

@Component({
  selector: 'app-my-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, SearchableSelect, SearchableMultiSelect],
  templateUrl: './my-profile.html',
  styleUrl: './my-profile.scss'
})
export class MyProfile implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly lookup = inject(ProfileLookupService);
  private readonly cdr = inject(ChangeDetectorRef);

  profileForm!: FormGroup;
  skillsList: string[] = [];
  readonly avatarUrl = signal<string | null>(null);
  readonly isSaving = signal(false);
  private pendingAvatarFile: File | null = null;

  readonly isLoading = this.auth.isLoading;
  readonly currentUser = this.auth.currentUser;
  readonly profile = this.auth.profile;

  readonly searchColleges = (q: string) => this.lookup.searchColleges(q);
  readonly searchSpecializations = (q: string) => this.lookup.searchSpecializations(q);
  readonly searchSkills = (q: string) => this.lookup.searchSkills(q);

  ngOnInit(): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/profile' } });
      return;
    }

    this.initializeForm();
    void this.fetchAndLoadProfile();
  }

  private async fetchAndLoadProfile(): Promise<void> {
    const user = this.auth.currentUser();
    if (!user) return;

    const profile = (await this.auth.getProfile(user.id)) ?? this.profile();
    this.loadProfileData(profile);
    this.cdr.markForCheck();
  }

  private initializeForm(): void {
    this.profileForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.pattern(/^(\+?[0-9]{10,15})?$/)]],
      collegeName: ['', [Validators.required, Validators.minLength(2)]],
      degree: ['', [Validators.required]],
      specialization: ['', [Validators.required]],
      currentYear: ['', [Validators.required]],
      graduationYear: ['', [Validators.required]],
      bio: ['', [Validators.maxLength(500)]],
      linkedinUrl: [''],
      githubUrl: [''],
      portfolioUrl: ['']
    });
  }

  private loadProfileData(profile: UserProfile | null): void {
    if (!profile) return;

    this.profileForm.patchValue({
      fullName: profile.full_name || '',
      phone: profile.phone || '',
      collegeName: profile.college_name || '',
      degree: profile.degree || '',
      specialization: profile.specialization || '',
      currentYear: profile.current_year?.toString() || '',
      graduationYear: profile.graduation_year?.toString() || '',
      bio: profile.bio || '',
      linkedinUrl: profile.linkedin_url || '',
      githubUrl: profile.github_url || '',
      portfolioUrl: profile.portfolio_url || ''
    });

    this.skillsList = profile.skills ? [...profile.skills] : [];
    this.avatarUrl.set(profile.avatar_url);
  }

  onSkillsChange(skills: string[]): void {
    this.skillsList = skills;
    this.cdr.markForCheck();
  }

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.toast.error('Only JPEG, PNG, and WebP images are allowed.');
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('Image must be smaller than 5MB.');
      input.value = '';
      return;
    }

    this.pendingAvatarFile = file;

    try {
      const preview = await this.compressImage(file, 200);
      this.avatarUrl.set(preview);
      this.toast.success('Photo selected — click Save Profile to keep it.');
    } catch {
      this.toast.error('Could not load image. Please try another file.');
      this.pendingAvatarFile = null;
    } finally {
      input.value = '';
      this.cdr.markForCheck();
    }
  }

  private compressImage(file: File, maxDim = 200): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas not supported'));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  getInitials(): string {
    const name = this.profileForm.get('fullName')?.value as string;
    if (name?.trim()) return name.trim().charAt(0).toUpperCase();
    return this.currentUser()?.email?.charAt(0).toUpperCase() || '?';
  }

  getYears(): number[] {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let i = currentYear; i <= currentYear + 10; i++) {
      years.push(i);
    }
    return years;
  }

  isFieldInvalid(field: string): boolean {
    const control = this.profileForm.get(field);
    return !!(control?.invalid && control.touched);
  }

  private async resolveAvatarUrl(): Promise<string | null> {
    if (!this.pendingAvatarFile) {
      return this.avatarUrl();
    }

    const user = this.currentUser();
    if (!user) {
      return this.compressImage(this.pendingAvatarFile, 200);
    }

    const file = this.pendingAvatarFile;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${user.id}/avatar.${ext}`;

    try {
      const uploadPromise = supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      const timeoutPromise = new Promise<{ error: { message: string } }>(resolve =>
        setTimeout(() => resolve({ error: { message: 'timeout' } }), 8000)
      );

      const { error } = await Promise.race([uploadPromise, timeoutPromise]);

      if (!error) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        return `${data.publicUrl}?t=${Date.now()}`;
      }
    } catch {
      // fall through to base64
    }

    return this.compressImage(file, 200);
  }

  private buildProfileUpdate(avatarUrl: string | null): Partial<UserProfile> {
    const v = this.profileForm.getRawValue();
    const hasRequiredFields =
      v.fullName && v.collegeName && v.degree && v.specialization && v.currentYear && v.graduationYear;

    return {
      full_name: v.fullName.trim(),
      phone: v.phone?.trim() || null,
      college_name: v.collegeName.trim(),
      degree: v.degree,
      specialization: v.specialization.trim(),
      current_year: v.currentYear ? Number(v.currentYear) : null,
      graduation_year: v.graduationYear ? Number(v.graduationYear) : null,
      bio: v.bio?.trim() || null,
      linkedin_url: v.linkedinUrl?.trim() || null,
      github_url: v.githubUrl?.trim() || null,
      portfolio_url: v.portfolioUrl?.trim() || null,
      skills: this.skillsList.length ? this.skillsList : null,
      avatar_url: avatarUrl,
      profile_completed: !!hasRequiredFields
    };
  }

  async saveProfile(): Promise<void> {
    if (this.isSaving() || this.isLoading()) return;

    this.profileForm.markAllAsTouched();
    if (!this.profileForm.valid) {
      this.toast.error('Please fill in all required fields.');
      return;
    }

    const user = this.currentUser();
    if (!user) {
      this.toast.error('You must be logged in to save your profile.');
      return;
    }

    this.isSaving.set(true);
    try {
      const avatarUrl = await this.resolveAvatarUrl();
      const payload = this.buildProfileUpdate(avatarUrl);
      const success = await this.auth.updateProfile(user.id, payload);

      if (success) {
        this.pendingAvatarFile = null;
        this.cdr.markForCheck();
      }
    } finally {
      this.isSaving.set(false);
      this.cdr.markForCheck();
    }
  }
}
