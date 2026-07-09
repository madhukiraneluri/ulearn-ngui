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
  AdminPaperInput,
  AdminPaperRow,
  AdminPapersService
} from '../services/admin-papers.service';
import { PaperCategory, PaperStatus } from '../../models';
import { ToastService } from '../../core/services/toast';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { prepareBlogImage } from '../services/blog-image.util';

@Component({
  selector: 'app-papers-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './papers-management.html',
  styleUrl: './papers-management.scss'
})
export class PapersManagement implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly papersService = inject(AdminPapersService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly papers = signal<AdminPaperRow[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isUploadingThumbnail = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly thumbnailPreview = signal<string | null>(null);

  form!: FormGroup;
  private pendingThumbnailFile: File | null = null;

  readonly categories: PaperCategory[] = ['ai', 'nlp', 'cv', 'health', 'business'];
  readonly statuses: PaperStatus[] = ['published', 'under_review', 'preprint'];

  ngOnInit(): void {
    this.buildForm();
    void this.loadPapers();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      title: ['', Validators.required],
      authorsCsv: ['', Validators.required],
      abstract: ['', Validators.required],
      category: ['ai' as PaperCategory, Validators.required],
      status: ['published' as PaperStatus, Validators.required],
      venue: ['', Validators.required],
      year: [new Date().getFullYear(), [Validators.required, Validators.min(1990)]],
      citations: [0, [Validators.required, Validators.min(0)]],
      pdfUrl: [''],
      doiUrl: [''],
      thumbnailUrl: ['']
    });
  }

  private async loadPapers(): Promise<void> {
    this.isLoading.set(true);
    this.papers.set(await this.papersService.listAll());
    this.isLoading.set(false);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.pendingThumbnailFile = null;
    this.thumbnailPreview.set(null);
    this.form.reset({
      title: '',
      authorsCsv: '',
      abstract: '',
      category: 'ai',
      status: 'published',
      venue: '',
      year: new Date().getFullYear(),
      citations: 0,
      pdfUrl: '',
      doiUrl: '',
      thumbnailUrl: ''
    });
    this.showForm.set(true);
  }

  openEdit(row: AdminPaperRow): void {
    this.editingId.set(row.id);
    this.pendingThumbnailFile = null;
    this.thumbnailPreview.set(row.thumbnailUrl);
    this.form.reset({
      title: row.title,
      authorsCsv: row.authors.join(', '),
      abstract: row.abstract,
      category: row.category,
      status: row.status,
      venue: row.venue,
      year: row.year,
      citations: row.citations,
      pdfUrl: row.pdfUrl ?? '',
      doiUrl: row.doiUrl ?? '',
      thumbnailUrl: row.thumbnailUrl ?? ''
    });
    this.showForm.set(true);
  }

  closeForm(): void {
    const preview = this.thumbnailPreview();
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    this.showForm.set(false);
    this.editingId.set(null);
    this.pendingThumbnailFile = null;
    this.thumbnailPreview.set(null);
  }

  onThumbnailSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void this.setThumbnailFromFile(file);
    (event.target as HTMLInputElement).value = '';
  }

  private async setThumbnailFromFile(file: File): Promise<void> {
    try {
      const prepared = await prepareBlogImage(file, 800);
      this.pendingThumbnailFile = prepared;
      this.thumbnailPreview.set(URL.createObjectURL(prepared));
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not load image');
      this.pendingThumbnailFile = null;
      this.thumbnailPreview.set(this.form.get('thumbnailUrl')?.value || null);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const input: AdminPaperInput = {
      title: String(raw.title).trim(),
      authors: this.parseCsv(String(raw.authorsCsv ?? '')),
      abstract: String(raw.abstract).trim(),
      category: raw.category as PaperCategory,
      status: raw.status as PaperStatus,
      venue: String(raw.venue).trim(),
      year: Number(raw.year),
      citations: Number(raw.citations),
      pdfUrl: String(raw.pdfUrl ?? '').trim() || undefined,
      doiUrl: String(raw.doiUrl ?? '').trim() || undefined,
      thumbnailUrl: String(raw.thumbnailUrl ?? '').trim() || undefined
    };

    if (input.authors.length === 0) {
      this.toast.error('Add at least one author');
      return;
    }

    this.isSaving.set(true);
    try {
      let id = this.editingId();
      if (id) {
        await this.papersService.update(id, input);
        this.toast.success('Paper updated');
      } else {
        const created = await this.papersService.create(input);
        if (!created) throw new Error('Could not create paper');
        id = created.id;
        this.toast.success('Paper created');
      }

      if (id && this.pendingThumbnailFile) {
        this.isUploadingThumbnail.set(true);
        const url = await this.papersService.uploadThumbnail(id, this.pendingThumbnailFile);
        await this.papersService.update(id, { ...input, thumbnailUrl: url });
        this.pendingThumbnailFile = null;
        this.isUploadingThumbnail.set(false);
      }

      this.closeForm();
      await this.loadPapers();
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.isSaving.set(false);
      this.isUploadingThumbnail.set(false);
    }
  }

  async deleteRow(row: AdminPaperRow): Promise<void> {
    if (
      !(await this.confirmDialog.confirm({
        title: 'Delete paper',
        message: `Delete "${row.title}"?`,
        confirmLabel: 'Delete',
        variant: 'danger'
      }))
    ) {
      return;
    }
    const ok = await this.papersService.delete(row.id);
    if (ok) {
      this.toast.success('Paper deleted');
      if (this.editingId() === row.id) this.closeForm();
      await this.loadPapers();
    } else {
      this.toast.error('Could not delete');
    }
  }

  private parseCsv(value: string): string[] {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
}
