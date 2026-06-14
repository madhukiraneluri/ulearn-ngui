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
import { AdminSiteSettingsService } from '../services/admin-site-settings.service';
import { ToastService } from '../../core/services/toast';
import { prepareBlogImage } from '../services/blog-image.util';
import {
  DEFAULT_HOME_HERO_IMAGE,
  resolvePublicImageUrl
} from '../../shared/utils/drive-image.util';

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss'
})
export class Settings implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(AdminSiteSettingsService);
  private readonly toast = inject(ToastService);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isUploading = signal(false);
  readonly previewUrl = signal<string | null>(null);

  form!: FormGroup;
  private pendingFile: File | null = null;

  ngOnInit(): void {
    this.form = this.fb.group({
      heroImageUrl: ['', Validators.required]
    });
    void this.loadSettings();
  }

  private async loadSettings(): Promise<void> {
    this.isLoading.set(true);
    try {
      const url = await this.settingsService.getHomeHeroImageUrl();
      const value = url.trim() || DEFAULT_HOME_HERO_IMAGE;
      this.form.patchValue({ heroImageUrl: value });
      this.previewUrl.set(this.displayUrl(value));
    } catch {
      this.toast.error('Could not load site settings.');
    } finally {
      this.isLoading.set(false);
    }
  }

  displayUrl(raw: string): string {
    return resolvePublicImageUrl(raw);
  }

  onHeroUrlChange(): void {
    const raw = String(this.form.get('heroImageUrl')?.value ?? '').trim();
    this.previewUrl.set(raw ? this.displayUrl(raw) : null);
    this.pendingFile = null;
  }

  async onHeroFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.isUploading.set(true);
    try {
      const prepared = await prepareBlogImage(file, 1600);
      this.pendingFile = prepared;
      this.previewUrl.set(URL.createObjectURL(prepared));
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not process image.');
    } finally {
      this.isUploading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    try {
      let url = String(this.form.get('heroImageUrl')?.value ?? '').trim();

      if (this.pendingFile) {
        url = await this.settingsService.uploadHomeHeroImage(this.pendingFile);
        this.pendingFile = null;
        this.form.patchValue({ heroImageUrl: url });
      }

      await this.settingsService.saveHomeHeroImageUrl(url);
      this.previewUrl.set(this.displayUrl(url));
      this.toast.success('Home hero image saved.');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
