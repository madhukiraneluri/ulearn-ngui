import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import {
  AdminCourseService,
  AdminCourseRow,
  AdminCourseInput
} from '../services/admin-course.service';
import { CourseBulkImportService } from '../services/course-bulk-import.service';
import {
  BULK_COURSE_COLUMNS,
  BulkImportRowResult
} from '../services/course-bulk-import.util';
import { CourseCategory, CourseFormat, CourseStatus } from '../../models';
import { ToastService } from '../../core/services/toast';
import { prepareBlogImage } from '../services/blog-image.util';

@Component({
  selector: 'app-courses-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './courses-management.html',
  styleUrl: './courses-management.scss'
})
export class CoursesManagement implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly courseService = inject(AdminCourseService);
  private readonly bulkImportService = inject(CourseBulkImportService);
  private readonly toast = inject(ToastService);

  readonly bulkColumns = BULK_COURSE_COLUMNS;

  readonly courses = signal<AdminCourseRow[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly showBulkModal = signal(false);
  readonly bulkFile = signal<File | null>(null);
  readonly bulkImporting = signal(false);
  readonly bulkResults = signal<BulkImportRowResult[] | null>(null);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly isUploadingThumbnail = signal(false);
  readonly thumbnailPreview = signal<string | null>(null);

  form!: FormGroup;
  private pendingThumbnailFile: File | null = null;

  readonly categories: CourseCategory[] = ['technical', 'creative', 'business'];
  readonly statuses: CourseStatus[] = ['draft', 'published', 'archived'];
  readonly formats: (CourseFormat | '')[] = ['', '45-day', '3-month'];

  ngOnInit(): void {
    this.buildForm();
    void this.loadCourses();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      title: ['', Validators.required],
      slug: ['', Validators.required],
      description: ['', Validators.required],
      category: ['technical' as CourseCategory, Validators.required],
      status: ['draft' as CourseStatus, Validators.required],
      price: [0, [Validators.required, Validators.min(0)]],
      originalPrice: [0, [Validators.required, Validators.min(0)]],
      durationMonths: [1, [Validators.required, Validators.min(0)]],
      durationDays: [null as number | null],
      weeklyHours: [null as number | null],
      classCount: [null as number | null],
      hoursPerClass: [null as number | null],
      courseFormat: ['' as CourseFormat | ''],
      totalLessons: [0, [Validators.required, Validators.min(0)]],
      rating: [4.5, [Validators.required, Validators.min(0), Validators.max(5)]],
      isResearchCourse: [false],
      thumbnailUrl: ['']
    });

    this.form.get('title')?.valueChanges.subscribe((title: string) => {
      if (!this.editingId() && title) {
        this.form.patchValue({ slug: this.courseService.slugify(title) }, { emitEvent: false });
      }
    });
  }

  private async loadCourses(): Promise<void> {
    this.isLoading.set(true);
    const list = await this.courseService.listAll();
    this.courses.set(list);
    this.isLoading.set(false);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.pendingThumbnailFile = null;
    this.thumbnailPreview.set(null);
    this.form.reset({
      title: '',
      slug: '',
      description: '',
      category: 'technical',
      status: 'draft',
      price: 0,
      originalPrice: 0,
      durationMonths: 1,
      durationDays: null,
      weeklyHours: null,
      classCount: null,
      hoursPerClass: null,
      courseFormat: '',
      totalLessons: 0,
      rating: 4.5,
      isResearchCourse: false,
      thumbnailUrl: ''
    });
    this.showForm.set(true);
  }

  openEdit(course: AdminCourseRow): void {
    this.editingId.set(course.id);
    this.pendingThumbnailFile = null;
    this.thumbnailPreview.set(course.thumbnailUrl);
    this.form.patchValue({
      title: course.title,
      slug: course.slug,
      description: course.description,
      category: course.category,
      status: course.status,
      price: course.price,
      originalPrice: course.originalPrice,
      durationMonths: course.durationMonths,
      durationDays: course.durationDays,
      weeklyHours: course.weeklyHours,
      classCount: course.liveClassCount,
      hoursPerClass: course.hoursPerClass,
      courseFormat: course.courseFormat ?? '',
      totalLessons: course.totalLessons,
      rating: course.rating,
      isResearchCourse: course.isResearchCourse,
      thumbnailUrl: course.thumbnailUrl ?? ''
    });
    this.showForm.set(true);
  }

  closeForm(): void {
    const preview = this.thumbnailPreview();
    if (preview?.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }
    this.showForm.set(false);
    this.editingId.set(null);
    this.pendingThumbnailFile = null;
    this.thumbnailPreview.set(null);
  }

  onThumbnailSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    void this.setThumbnailFromFile(file);
    input.value = '';
  }

  private async setThumbnailFromFile(file: File): Promise<void> {
    try {
      const prepared = await prepareBlogImage(file, 800);
      this.pendingThumbnailFile = prepared;
      this.thumbnailPreview.set(URL.createObjectURL(prepared));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load image';
      this.toast.error(msg);
      this.pendingThumbnailFile = null;
      this.thumbnailPreview.set(this.form.get('thumbnailUrl')?.value || null);
    }
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    const input: AdminCourseInput = {
      title: v.title,
      slug: v.slug,
      description: v.description,
      category: v.category,
      status: v.status,
      price: Number(v.price),
      originalPrice: Number(v.originalPrice),
      durationMonths: Number(v.durationMonths),
      durationDays: v.durationDays != null ? Number(v.durationDays) : undefined,
      weeklyHours: v.weeklyHours != null ? Number(v.weeklyHours) : undefined,
      classCount: v.classCount != null ? Number(v.classCount) : undefined,
      hoursPerClass: v.hoursPerClass != null ? Number(v.hoursPerClass) : undefined,
      courseFormat: v.courseFormat || undefined,
      totalLessons: Number(v.totalLessons),
      rating: Number(v.rating),
      isResearchCourse: Boolean(v.isResearchCourse),
      thumbnailUrl: v.thumbnailUrl || undefined
    };

    this.isSaving.set(true);
    try {
      let courseId = this.editingId();

      if (courseId) {
        await this.courseService.update(courseId, input);
        this.toast.success('Course updated');
      } else {
        const created = await this.courseService.create(input);
        if (!created) throw new Error('Could not create course');
        courseId = created.id;
        this.toast.success('Course created');
      }

      if (courseId && this.pendingThumbnailFile) {
        this.isUploadingThumbnail.set(true);
        const url = await this.courseService.uploadThumbnail(courseId, this.pendingThumbnailFile);
        await this.courseService.update(courseId, { ...input, thumbnailUrl: url });
        this.pendingThumbnailFile = null;
        this.isUploadingThumbnail.set(false);
      }

      this.closeForm();
      await this.loadCourses();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      this.toast.error(msg);
    } finally {
      this.isSaving.set(false);
      this.isUploadingThumbnail.set(false);
    }
  }

  async deleteCourse(course: AdminCourseRow): Promise<void> {
    if (!confirm(`Delete "${course.title}"? This cannot be undone.`)) return;

    const ok = await this.courseService.delete(course.id);
    if (ok) {
      this.toast.success('Course deleted');
      await this.loadCourses();
    } else {
      this.toast.error('Could not delete course');
    }
  }

  formatPrice(price: number): string {
    return '₹' + price.toLocaleString('en-IN');
  }

  statusClass(status: CourseStatus): string {
    return `status-${status}`;
  }

  openBulkModal(): void {
    this.bulkFile.set(null);
    this.bulkResults.set(null);
    this.showBulkModal.set(true);
  }

  closeBulkModal(): void {
    this.showBulkModal.set(false);
    this.bulkFile.set(null);
    this.bulkResults.set(null);
  }

  downloadBulkSample(): void {
    this.bulkImportService.downloadSampleExcel();
  }

  onBulkFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.bulkFile.set(file);
    this.bulkResults.set(null);
    input.value = '';
  }

  async runBulkImport(): Promise<void> {
    const file = this.bulkFile();
    if (!file) {
      this.toast.error('Please select an Excel file (.xlsx)');
      return;
    }

    this.bulkImporting.set(true);
    this.bulkResults.set(null);
    try {
      const rows = await this.bulkImportService.parseExcelFile(file);
      if (rows.length === 0) {
        this.toast.error('No data rows found. Add courses below the header row.');
        return;
      }
      const results = await this.bulkImportService.importRows(rows);
      this.bulkResults.set(results);
      const ok = results.filter((r) => r.success).length;
      const fail = results.length - ok;
      if (ok > 0) await this.loadCourses();
      if (fail === 0) {
        this.toast.success(`Imported ${ok} course${ok === 1 ? '' : 's'}`);
        this.closeBulkModal();
      } else if (ok === 0) {
        this.toast.error(`Import failed for all ${fail} row${fail === 1 ? '' : 's'}`);
      } else {
        this.toast.success(`Imported ${ok}; ${fail} row${fail === 1 ? '' : 's'} failed`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      this.toast.error(msg);
    } finally {
      this.bulkImporting.set(false);
    }
  }
}
