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
  AdminBlogImageRow,
  AdminBlogInput,
  AdminBlogRow,
  AdminBlogsService
} from '../services/admin-blogs.service';
import { BlogStatus } from '../../models';
import { ToastService } from '../../core/services/toast';
import { prepareBlogImage } from '../services/blog-image.util';

@Component({
  selector: 'app-blogs-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './blogs-management.html',
  styleUrl: './blogs-management.scss'
})
export class BlogsManagement implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly blogsService = inject(AdminBlogsService);
  private readonly toast = inject(ToastService);

  readonly blogs = signal<AdminBlogRow[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isUploadingCover = signal(false);
  readonly isUploadingGallery = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly galleryImages = signal<AdminBlogImageRow[]>([]);

  form!: FormGroup;
  private pendingCoverFile: File | null = null;
  readonly coverPreview = signal<string | null>(null);

  readonly statuses: BlogStatus[] = ['draft', 'published'];

  ngOnInit(): void {
    this.buildForm();
    void this.loadBlogs();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      title: ['', Validators.required],
      slug: ['', Validators.required],
      summary: [''],
      content: ['', Validators.required],
      eventDate: [''],
      status: ['draft' as BlogStatus, Validators.required],
      coverImageUrl: ['']
    });

    this.form.get('title')?.valueChanges.subscribe((title: string) => {
      if (!this.editingId() && title) {
        this.form.patchValue(
          { slug: this.blogsService.slugify(title) },
          { emitEvent: false }
        );
      }
    });
  }

  private async loadBlogs(): Promise<void> {
    this.isLoading.set(true);
    const list = await this.blogsService.listAll();
    this.blogs.set(list);
    this.isLoading.set(false);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.pendingCoverFile = null;
    this.coverPreview.set(null);
    this.galleryImages.set([]);
    this.form.reset({
      title: '',
      slug: '',
      summary: '',
      content: '',
      eventDate: '',
      status: 'draft',
      coverImageUrl: ''
    });
    this.showForm.set(true);
  }

  async openEdit(blog: AdminBlogRow): Promise<void> {
    this.editingId.set(blog.id);
    this.pendingCoverFile = null;
    this.coverPreview.set(blog.coverImageUrl);
    this.galleryImages.set([...blog.images]);
    this.form.reset({
      title: blog.title,
      slug: blog.slug,
      summary: blog.summary ?? '',
      content: blog.content,
      eventDate: blog.eventDate ?? '',
      status: blog.status,
      coverImageUrl: blog.coverImageUrl ?? ''
    });
    this.showForm.set(true);
  }

  closeForm(): void {
    const preview = this.coverPreview();
    if (preview?.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }
    this.showForm.set(false);
    this.pendingCoverFile = null;
    this.coverPreview.set(null);
    this.galleryImages.set([]);
  }

  onCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    void this.setCoverFromFile(file);
    input.value = '';
  }

  private async setCoverFromFile(file: File): Promise<void> {
    try {
      const prepared = await prepareBlogImage(file, 1200);
      this.pendingCoverFile = prepared;
      this.coverPreview.set(URL.createObjectURL(prepared));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load image';
      this.toast.error(msg);
      this.pendingCoverFile = null;
      this.coverPreview.set(this.form.get('coverImageUrl')?.value || null);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const input: AdminBlogInput = {
      slug: String(raw.slug).trim(),
      title: String(raw.title).trim(),
      summary: String(raw.summary ?? '').trim() || undefined,
      content: String(raw.content).trim(),
      eventDate: String(raw.eventDate ?? '').trim() || undefined,
      status: raw.status as BlogStatus,
      coverImageUrl: String(raw.coverImageUrl ?? '').trim() || undefined
    };

    this.isSaving.set(true);
    try {
      const id = this.editingId();
      let blogId = id;

      if (id) {
        await this.blogsService.update(id, input);
        this.toast.success('Blog updated');
      } else {
        const created = await this.blogsService.create(input);
        if (!created) throw new Error('Could not create blog');
        blogId = created.id;
        this.editingId.set(created.id);
        this.toast.success('Blog created — you can now add gallery images');
      }

      if (blogId && this.pendingCoverFile) {
        this.isUploadingCover.set(true);
        const url = await this.blogsService.uploadImage(blogId, this.pendingCoverFile);
        await this.blogsService.update(blogId, { ...input, coverImageUrl: url });
        this.form.patchValue({ coverImageUrl: url });
        this.coverPreview.set(url);
        this.pendingCoverFile = null;
        this.isUploadingCover.set(false);
      }

      await this.loadBlogs();
      this.closeForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
      this.isUploadingCover.set(false);
    }
  }

  async deleteBlog(blog: AdminBlogRow): Promise<void> {
    if (!confirm(`Delete blog "${blog.title}"? This cannot be undone.`)) return;

    const ok = await this.blogsService.delete(blog.id);
    if (ok) {
      this.toast.success('Blog deleted');
      if (this.editingId() === blog.id) this.closeForm();
      await this.loadBlogs();
    } else {
      this.toast.error('Could not delete blog');
    }
  }

  async onGallerySelected(event: Event): Promise<void> {
    const blogId = this.editingId();
    if (!blogId) {
      this.toast.error('Save the blog first before uploading images');
      return;
    }

    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    this.isUploadingGallery.set(true);
    try {
      for (const file of Array.from(files)) {
        const prepared = await prepareBlogImage(file, 1400);
        const url = await this.blogsService.uploadImage(blogId, prepared);
        const row = await this.blogsService.addImage(blogId, url);
        if (row) {
          this.galleryImages.update((imgs) => [...imgs, row]);
        }
      }
      this.toast.success('Images uploaded');
      await this.loadBlogs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      this.toast.error(msg);
    } finally {
      this.isUploadingGallery.set(false);
      input.value = '';
    }
  }

  async updateImageCaption(image: AdminBlogImageRow, event: Event): Promise<void> {
    const caption = (event.target as HTMLInputElement).value;
    try {
      const updated = await this.blogsService.updateImage(image.id, { caption });
      if (updated) {
        this.galleryImages.update((imgs) =>
          imgs.map((img) => (img.id === image.id ? updated : img))
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      this.toast.error(msg);
    }
  }

  async deleteGalleryImage(image: AdminBlogImageRow): Promise<void> {
    if (!confirm('Remove this image from the blog?')) return;

    const ok = await this.blogsService.deleteImage(image.id);
    if (ok) {
      this.galleryImages.update((imgs) => imgs.filter((i) => i.id !== image.id));
      this.toast.success('Image removed');
      await this.loadBlogs();
    } else {
      this.toast.error('Could not remove image');
    }
  }

  truncate(text: string, max = 80): string {
    if (text.length <= max) return text;
    return text.slice(0, max).trimEnd() + '…';
  }

  formatDate(date: string | null): string {
    if (!date) return '—';
    return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }
}
