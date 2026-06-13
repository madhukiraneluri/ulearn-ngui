import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject
} from '@angular/core';
import { Observable, of } from 'rxjs';
import { ProfileLookupService } from '../../shared/services/profile-lookup.service';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormControl
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SearchableSelect } from '../../shared/components/searchable-select/searchable-select';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import type { UserProfile } from '../../core/supabase.client';

@Component({
  selector: 'app-complete-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, SearchableSelect],
  templateUrl: './complete-profile.html',
  styleUrl: './complete-profile.scss'
})
export class CompleteProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  currentStep = 1;
  totalSteps = 3;

  // Dropdown options (can be replaced by remote fetch later)
  colleges: string[] = [
    'Indian Institute of Technology',
    'National Institute of Technology',
    'Delhi University',
    'Anna University',
    'Other'
  ];

  specializations: string[] = [
    'Computer Science',
    'Electronics',
    'Mechanical',
    'Civil',
    'Business',
    'Other'
  ];

  showCustomSpecialization = false;

  // search function for colleges used by SearchableSelect
  private readonly lookup = inject(ProfileLookupService);
  // delegate searches to ProfileLookupService
  readonly searchColleges = (q: string) => this.lookup.searchColleges(q);
  readonly searchSpecializations = (q: string) => this.lookup.searchSpecializations(q);

  // Step 1: Academic Information
  academicForm!: FormGroup;

  // Step 2: Career Information
  careerForm!: FormGroup;

  // Step 3: Professional Links
  linksForm!: FormGroup;

  skillInput = '';
  skillsList: string[] = [];
  private submitting = false;

  readonly isLoading = this.auth.isLoading;
  readonly currentUser = this.auth.currentUser;
  readonly profile = this.auth.profile;

  ngOnInit(): void {
    this.initializeForms();

    // Load existing profile data if available
    const profile = this.profile();
    if (profile) {
      this.loadProfileData(profile);
    }

    // update showCustomSpecialization when specialization control changes
    this.academicForm.get('specialization')?.valueChanges.subscribe((v: string) => {
      this.showCustomSpecialization = v === 'Other';
    });
  }

  initializeForms(): void {
    // Step 1: Academic Information
    this.academicForm = this.fb.group({
      collegeName: ['', [Validators.required]],
      degree: ['', [Validators.required]],
      specialization: ['', [Validators.required]],
      customSpecialization: [''],
      currentYear: ['', [Validators.required, Validators.min(1), Validators.max(6)]],
      graduationYear: ['', [Validators.required]]
    });

    // Step 2: Career Information
    this.careerForm = this.fb.group({
      bio: ['', [Validators.maxLength(500)]],
      interests: ['', []]
    });

    // Step 3: Professional Links
    this.linksForm = this.fb.group({
      linkedinUrl: ['', [Validators.pattern(/^(https?:\/\/)?(www\.)?linkedin\.com\/.*|^$/)]],
      githubUrl: ['', [Validators.pattern(/^(https?:\/\/)?(www\.)?github\.com\/.*|^$/)]],
      portfolioUrl: ['', [Validators.pattern(/^(https?:\/\/)?[a-z0-9-]+(\..*)?|^$/i)]]
    });
  }

  loadProfileData(profile: UserProfile): void {
    if (profile.full_name) {
      this.academicForm.patchValue({
        collegeName: profile.college_name || '',
        degree: profile.degree || '',
        specialization: profile.specialization || '',
        customSpecialization: '',
        currentYear: profile.current_year || '',
        graduationYear: profile.graduation_year || ''
      });
    }

    if (profile.bio) {
      this.careerForm.patchValue({
        bio: profile.bio || ''
      });
    }

    if (profile.skills) {
      this.skillsList = profile.skills || [];
    }

    if (profile.linkedin_url) {
      this.linksForm.patchValue({
        linkedinUrl: profile.linkedin_url || '',
        githubUrl: profile.github_url || '',
        portfolioUrl: profile.portfolio_url || ''
      });
    }
  }

  nextStep(): void {
    if (this.currentStep === 1 && this.academicForm.valid) {
      this.currentStep++;
    } else if (this.currentStep === 2) {
      this.currentStep++;
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  async skipStep(): Promise<void> {
    await this.router.navigate(['/']);
  }

  addSkill(skill: string): void {
    const trimmed = skill.trim().toLowerCase();
    if (trimmed && !this.skillsList.includes(trimmed)) {
      this.skillsList = [...this.skillsList, trimmed];
      this.skillInput = '';
    }
  }

  onSpecializationChange(value: string): void {
    this.showCustomSpecialization = value === 'Other';
    if (!this.showCustomSpecialization) {
      this.academicForm.get('customSpecialization')?.setValue('');
    }
  }

  removeSkill(skill: string): void {
    this.skillsList = this.skillsList.filter(s => s !== skill);
  }

  onSkillInputKeydown(event: KeyboardEvent, input: string): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addSkill(input);
    }
  }

  getProgressPercentage(): number {
    return (this.currentStep / this.totalSteps) * 100;
  }

  async submitProfile(): Promise<void> {
    if (this.submitting || this.isLoading()) return;
    if (!this.linksForm.valid) return;

    this.submitting = true;
    try {
      const user = this.currentUser();
      if (!user) return;

      const academic = this.academicForm.value;
      const career = this.careerForm.value;
      const links = this.linksForm.value;

      // If user selected "Other" specialization and provided a custom value, use that
      const specializationValue = academic.specialization === 'Other' && academic.customSpecialization
        ? academic.customSpecialization
        : academic.specialization;

      const profileData: Partial<UserProfile> = {
        college_name: academic.collegeName,
        degree: academic.degree,
        specialization: specializationValue,
        current_year: academic.currentYear ? Number(academic.currentYear) : null,
        graduation_year: academic.graduationYear ? Number(academic.graduationYear) : null,
        bio: career.bio || null,
        linkedin_url: links.linkedinUrl || null,
        github_url: links.githubUrl || null,
        portfolio_url: links.portfolioUrl || null,
        skills: this.skillsList.length ? this.skillsList : null,
        profile_completed: true
      };

      const success = await this.auth.updateProfile(user.id, profileData);

      if (success) {
        await this.router.navigate(['/']);
      }
    } finally {
      this.submitting = false;
    }
  }

  isStep1Valid(): boolean {
    if (!this.academicForm.valid) return false;
    if (this.showCustomSpecialization) {
      const custom = this.academicForm.get('customSpecialization')?.value;
      return !!(custom && String(custom).trim().length > 0);
    }
    return true;
  }

  isStep3Valid(): boolean {
    return this.linksForm.valid;
  }

  getYears(): number[] {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear; i <= currentYear + 10; i++) {
      years.push(i);
    }
    return years;
  }
}
