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
import {
  AdminStudentStoryInput,
  AdminStudentStoryRow,
  AdminStudentStoriesService
} from '../services/admin-student-stories.service';
import { ToastService } from '../../core/services/toast';
import { prepareBlogImage } from '../services/blog-image.util';

@Component({
  selector: 'app-student-stories-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './student-stories-management.html',
  styleUrl: './student-stories-management.scss'
})
export class StudentStoriesManagement implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly storiesService = inject(AdminStudentStoriesService);
  private readonly toast = inject(ToastService);

  readonly stories = signal<AdminStudentStoryRow[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isUploadingPhoto = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly photoPreview = signal<string | null>(null);

  form!: FormGroup;
  private pendingPhotoFile: File | null = null;

  ngOnInit(): void {
    this.buildForm();
    void this.loadStories();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      studentName: ['', Validators.required],
      collegeName: ['', Validators.required],
      currentRole: [''],
      impression: ['', Validators.required],
      sortOrder: [0, [Validators.required, Validators.min(0)]],
      isPublished: [true],
      photoUrl: ['']
    });
  }

  private async loadStories(): Promise<void> {
    this.isLoading.set(true);
    this.stories.set(await this.storiesService.listAll());
    this.isLoading.set(false);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.pendingPhotoFile = null;
    this.photoPreview.set(null);
    this.form.reset({
      studentName: '',
      collegeName: '',
      currentRole: '',
      impression: '',
      sortOrder: this.stories().length + 1,
      isPublished: true,
      photoUrl: ''
    });
    this.showForm.set(true);
  }

  openEdit(row: AdminStudentStoryRow): void {
    this.editingId.set(row.id);
    this.pendingPhotoFile = null;
    this.photoPreview.set(row.photoUrl);
    this.form.reset({
      studentName: row.studentName,
      collegeName: row.collegeName,
      currentRole: row.currentRole ?? '',
      impression: row.impression,
      sortOrder: row.sortOrder,
      isPublished: row.isPublished,
      photoUrl: row.photoUrl ?? ''
    });
    this.showForm.set(true);
  }

  closeForm(): void {
    const preview = this.photoPreview();
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    this.showForm.set(false);
    this.editingId.set(null);
    this.pendingPhotoFile = null;
    this.photoPreview.set(null);
  }

  onPhotoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void this.setPhotoFromFile(file);
    (event.target as HTMLInputElement).value = '';
  }

  private async setPhotoFromFile(file: File): Promise<void> {
    try {
      const prepared = await prepareBlogImage(file, 800);
      this.pendingPhotoFile = prepared;
      this.photoPreview.set(URL.createObjectURL(prepared));
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not load image');
      this.pendingPhotoFile = null;
      this.photoPreview.set(this.form.get('photoUrl')?.value || null);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const input: AdminStudentStoryInput = {
      studentName: String(raw.studentName).trim(),
      collegeName: String(raw.collegeName).trim(),
      currentRole: String(raw.currentRole ?? '').trim() || undefined,
      impression: String(raw.impression).trim(),
      sortOrder: Number(raw.sortOrder),
      isPublished: Boolean(raw.isPublished),
      photoUrl: String(raw.photoUrl ?? '').trim() || undefined
    };

    this.isSaving.set(true);
    try {
      let id = this.editingId();
      if (id) {
        await this.storiesService.update(id, input);
        this.toast.success('Story updated');
      } else {
        const created = await this.storiesService.create(input);
        if (!created) throw new Error('Could not create story');
        id = created.id;
        this.toast.success('Story created');
      }

      if (id && this.pendingPhotoFile) {
        this.isUploadingPhoto.set(true);
        const url = await this.storiesService.uploadPhoto(id, this.pendingPhotoFile);
        await this.storiesService.update(id, { ...input, photoUrl: url });
        this.pendingPhotoFile = null;
        this.isUploadingPhoto.set(false);
      }

      this.closeForm();
      await this.loadStories();
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.isSaving.set(false);
      this.isUploadingPhoto.set(false);
    }
  }

  async deleteRow(row: AdminStudentStoryRow): Promise<void> {
    if (!confirm(`Delete story from "${row.studentName}"?`)) return;
    const ok = await this.storiesService.delete(row.id);
    if (ok) {
      this.toast.success('Story deleted');
      if (this.editingId() === row.id) this.closeForm();
      await this.loadStories();
    } else {
      this.toast.error('Could not delete');
    }
  }
}
