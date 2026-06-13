import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { AdminCourseService, AdminCourseRow } from '../services/admin-course.service';
import {
  AdminMentorInput,
  AdminMentorRow,
  AdminMentorsService
} from '../services/admin-mentors.service';
import { ToastService } from '../../core/services/toast';

@Component({
  selector: 'app-mentors-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './mentors-management.html',
  styleUrl: './mentors-management.scss'
})
export class MentorsManagement implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly courseService = inject(AdminCourseService);
  private readonly mentorsService = inject(AdminMentorsService);
  private readonly toast = inject(ToastService);

  readonly courses = signal<AdminCourseRow[]>([]);
  readonly selectedCourseId = signal<string | null>(null);
  readonly mentors = signal<AdminMentorRow[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);

  form!: FormGroup;

  ngOnInit(): void {
    this.buildForm();
    void this.initPage();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      courseId: ['', Validators.required],
      name: ['', Validators.required],
      role: ['', Validators.required],
      company: ['', Validators.required],
      bio: ['', Validators.required],
      avatarUrl: [''],
      linkedInUrl: ['']
    });
  }

  private async initPage(): Promise<void> {
    this.isLoading.set(true);
    const list = await this.courseService.listAll();
    this.courses.set(list);

    const qp = this.route.snapshot.queryParamMap.get('courseId');
    const initial = qp && list.some((c) => c.id === qp) ? qp : list[0]?.id ?? null;
    if (initial) {
      this.selectedCourseId.set(initial);
      await this.loadMentors(initial);
    }
    this.isLoading.set(false);
  }

  async onCourseChange(event: Event): Promise<void> {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedCourseId.set(id);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { courseId: id },
      queryParamsHandling: 'merge'
    });
    await this.loadMentors(id);
  }

  private async loadMentors(courseId: string): Promise<void> {
    const rows = await this.mentorsService.listByCourse(courseId);
    this.mentors.set(rows);
  }

  selectedCourseTitle(): string {
    const id = this.selectedCourseId();
    return this.courses().find((c) => c.id === id)?.title ?? '';
  }

  openCreate(): void {
    const courseId = this.selectedCourseId();
    if (!courseId) {
      this.toast.error('Select a course first');
      return;
    }

    this.editingId.set(null);
    this.form.reset({
      courseId,
      name: '',
      role: '',
      company: '',
      bio: '',
      avatarUrl: '',
      linkedInUrl: ''
    });
    this.form.get('courseId')?.enable();
    this.showForm.set(true);
  }

  openEdit(mentor: AdminMentorRow): void {
    this.editingId.set(mentor.id);
    this.form.reset({
      courseId: mentor.courseId,
      name: mentor.name,
      role: mentor.role,
      company: mentor.company,
      bio: mentor.bio,
      avatarUrl: mentor.avatarUrl ?? '',
      linkedInUrl: mentor.linkedInUrl ?? ''
    });
    this.form.get('courseId')?.disable();
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.form.get('courseId')?.enable();
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const input: AdminMentorInput = {
      courseId: String(raw.courseId),
      name: String(raw.name).trim(),
      role: String(raw.role).trim(),
      company: String(raw.company).trim(),
      bio: String(raw.bio).trim(),
      avatarUrl: String(raw.avatarUrl ?? '').trim() || undefined,
      linkedInUrl: String(raw.linkedInUrl ?? '').trim() || undefined
    };

    this.isSaving.set(true);
    try {
      const id = this.editingId();
      if (id) {
        await this.mentorsService.update(id, input);
        this.toast.success('Mentor updated');
      } else {
        await this.mentorsService.create(input);
        this.toast.success('Mentor added');
      }
      this.closeForm();
      await this.loadMentors(input.courseId);
      if (input.courseId !== this.selectedCourseId()) {
        this.selectedCourseId.set(input.courseId);
        await this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { courseId: input.courseId },
          queryParamsHandling: 'merge'
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteMentor(mentor: AdminMentorRow): Promise<void> {
    if (!confirm(`Delete mentor "${mentor.name}" from ${mentor.courseTitle}?`)) return;

    const ok = await this.mentorsService.delete(mentor.id);
    if (ok) {
      this.toast.success('Mentor deleted');
      const courseId = this.selectedCourseId();
      if (courseId) await this.loadMentors(courseId);
    } else {
      this.toast.error('Could not delete mentor');
    }
  }

  truncate(text: string, max = 80): string {
    if (text.length <= max) return text;
    return text.slice(0, max).trimEnd() + '…';
  }
}
