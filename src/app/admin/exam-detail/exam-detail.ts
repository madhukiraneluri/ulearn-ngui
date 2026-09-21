import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminExamsService } from '../services/admin-exams.service';
import { ToastService } from '../../core/services/toast';
import type { Exam, ExamQuestion, ExamQuestionImportInput, ExamRole } from '../../models/index';

@Component({
  selector: 'app-exam-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './exam-detail.html',
  styleUrl: './exam-detail.scss'
})
export class ExamDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly examsService = inject(AdminExamsService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly importing = signal(false);
  readonly importingQuestions = signal(false);
  readonly exam = signal<Exam | null>(null);
  readonly roles = signal<ExamRole[]>([]);
  readonly questions = signal<ExamQuestion[]>([]);
  readonly selectedRoleId = signal('');
  readonly questionJson = signal('');

  readonly roleForm = this.fb.group({
    name: ['', Validators.required],
    slug: ['', Validators.required],
    hasCoding: [false]
  });

  readonly importText = signal('');

  private examId = '';

  ngOnInit(): void {
    this.examId = this.route.snapshot.paramMap.get('examId') ?? '';
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const exam = await this.examsService.listExams().then(
        (rows) => rows.find((row) => row.id === this.examId) ?? null
      );
      this.exam.set(exam);
      const roleList = await this.examsService.listRoles(this.examId);
      this.roles.set(roleList);
      if (roleList.length > 0) {
        this.selectedRoleId.set(roleList[0].id);
        await this.loadQuestions(roleList[0].id);
      }
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not load exam');
    } finally {
      this.loading.set(false);
    }
  }

  async onRoleSelect(event: Event): Promise<void> {
    const roleId = (event.target as HTMLSelectElement).value;
    this.selectedRoleId.set(roleId);
    await this.loadQuestions(roleId);
  }

  private async loadQuestions(roleId: string): Promise<void> {
    if (!roleId) {
      this.questions.set([]);
      return;
    }
    this.questions.set(await this.examsService.listQuestions(roleId));
  }

  async addRole(): Promise<void> {
    this.roleForm.markAllAsTouched();
    if (this.roleForm.invalid) return;

    const v = this.roleForm.getRawValue();
    try {
      const role = await this.examsService.upsertRole(this.examId, {
        name: v.name!,
        slug: v.slug!,
        hasCoding: !!v.hasCoding,
        sortOrder: this.roles().length
      });
      this.roles.update((rows) => [...rows.filter((r) => r.id !== role.id), role]);
      this.selectedRoleId.set(role.id);
      this.roleForm.reset({ hasCoding: false });
      this.toast.success('Role saved');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not save role');
    }
  }

  onImportTextChange(event: Event): void {
    this.importText.set((event.target as HTMLTextAreaElement).value);
  }

  onQuestionJsonChange(event: Event): void {
    this.questionJson.set((event.target as HTMLTextAreaElement).value);
  }

  async importCandidates(): Promise<void> {
    const lines = this.importText()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      this.toast.error('Paste CSV rows: email, fullName, roleSlug, phone, collegeName');
      return;
    }

    const candidates = lines.map((line) => {
      const [email, fullName, roleSlug, phone, collegeName] = line.split(',').map((p) => p.trim());
      return { email, fullName, roleSlug, phone, collegeName };
    });

    this.importing.set(true);
    try {
      const result = await this.examsService.importCandidates(this.examId, candidates);
      this.toast.success(`${result.summary.success} imported, ${result.summary.failed} failed`);
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      this.importing.set(false);
    }
  }

  async importQuestions(): Promise<void> {
    const roleId = this.selectedRoleId();
    if (!roleId) {
      this.toast.error('Select a role first');
      return;
    }

    let parsed: ExamQuestionImportInput[];
    try {
      const raw = JSON.parse(this.questionJson()) as ExamQuestionImportInput[];
      if (!Array.isArray(raw) || raw.length === 0) throw new Error('Expected a JSON array');
      parsed = raw;
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Invalid JSON');
      return;
    }

    this.importingQuestions.set(true);
    try {
      const count = await this.examsService.importQuestions(roleId, parsed);
      await this.loadQuestions(roleId);
      this.questionJson.set('');
      this.toast.success(`${count} questions imported`);
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      this.importingQuestions.set(false);
    }
  }

  async moveQuestion(question: ExamQuestion, direction: -1 | 1): Promise<void> {
    const list = [...this.questions()];
    const index = list.findIndex((q) => q.id === question.id);
    const target = index + direction;
    if (target < 0 || target >= list.length) return;

    const a = list[index];
    const b = list[target];
    try {
      await this.examsService.updateQuestionOrder(a.id, b.sortOrder);
      await this.examsService.updateQuestionOrder(b.id, a.sortOrder);
      await this.loadQuestions(this.selectedRoleId());
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not reorder');
    }
  }

  async deleteQuestion(questionId: string): Promise<void> {
    try {
      await this.examsService.deleteQuestion(questionId);
      await this.loadQuestions(this.selectedRoleId());
      this.toast.success('Question removed');
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'Could not delete');
    }
  }

  questionPreview(question: ExamQuestion): string {
    if (question.type === 'mcq') {
      const p = question.payload as { stem?: string };
      return p.stem ?? 'MCQ';
    }
    const p = question.payload as { title?: string };
    return p.title ?? 'Coding';
  }
}
