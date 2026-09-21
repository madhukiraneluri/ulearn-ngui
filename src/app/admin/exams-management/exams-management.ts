import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminExamsService } from '../services/admin-exams.service';
import { ToastService } from '../../core/services/toast';
import type { Exam } from '../../models/index';

@Component({
  selector: 'app-exams-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './exams-management.html',
  styleUrl: './exams-management.scss'
})
export class ExamsManagement implements OnInit {
  private readonly examsService = inject(AdminExamsService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly exams = signal<Exam[]>([]);
  readonly showForm = signal(false);

  readonly form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    startsAt: ['', Validators.required],
    endsAt: ['', Validators.required],
    durationMinutes: [60, [Validators.required, Validators.min(1)]],
    maxConcurrent: [1000, [Validators.required, Validators.min(1)]]
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.exams.set(await this.examsService.listExams());
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not load exams');
    } finally {
      this.loading.set(false);
    }
  }

  toggleForm(): void {
    this.showForm.update((v) => !v);
  }

  async createExam(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    this.saving.set(true);
    try {
      const exam = await this.examsService.createExam({
        title: v.title!,
        description: v.description || null,
        startsAt: new Date(v.startsAt!).toISOString(),
        endsAt: new Date(v.endsAt!).toISOString(),
        durationMinutes: Number(v.durationMinutes),
        maxConcurrent: Number(v.maxConcurrent)
      });
      this.exams.update((rows) => [exam, ...rows]);
      this.form.reset({ durationMinutes: 60, maxConcurrent: 1000 });
      this.showForm.set(false);
      this.toast.success('Exam created');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not create exam');
    } finally {
      this.saving.set(false);
    }
  }

  async publish(exam: Exam): Promise<void> {
    try {
      await this.examsService.updateExamStatus(exam.id, 'published');
      this.exams.update((rows) =>
        rows.map((row) => (row.id === exam.id ? { ...row, status: 'published' } : row))
      );
      this.toast.success('Exam published');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not publish exam');
    }
  }
}
