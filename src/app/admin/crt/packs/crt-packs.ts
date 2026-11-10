import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { ToastService } from '../../../core/services/toast';
import { CrtAdminService, CrtQuestion } from '../../services/crt-admin.service';
import {
  CrtAdminCompanyPack,
  CrtAdminPackService,
  CrtCompanyPackMembership,
  CrtCompanyPackStatus
} from '../../services/crt-admin-pack.service';
import { CrtShell } from '../crt-shell/crt-shell';

@Component({
  selector: 'app-crt-packs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CrtShell],
  templateUrl: './crt-packs.html',
  styleUrl: '../crt-admin.scss'
})
export class CrtPacks implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly packsService = inject(CrtAdminPackService);
  private readonly questionsService = inject(CrtAdminService);

  readonly packs = signal<CrtAdminCompanyPack[]>([]);
  readonly questionCounts = signal<Record<string, number>>({});
  readonly questions = signal<CrtQuestion[]>([]);
  readonly memberships = signal<CrtCompanyPackMembership[]>([]);

  readonly filters = [
    { id: 'all', label: 'All' },
    { id: 'draft', label: 'Draft' },
    { id: 'published', label: 'Published' }
  ] as const;

  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly busyPackId = signal<string | null>(null);
  readonly query = signal('');
  readonly statusFilter = signal<'all' | CrtCompanyPackStatus>('all');
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly selectedPackId = signal<string | null>(null);
  readonly membershipLoading = signal(false);
  readonly membershipError = signal<string | null>(null);
  readonly bankLoading = signal(false);
  readonly bankError = signal<string | null>(null);
  readonly questionQuery = signal('');
  readonly membershipBusy = signal(false);

  private readonly formHost = viewChild<ElementRef<HTMLElement>>('formHost');

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: ['']
  });

  readonly visiblePacks = computed(() => {
    const query = this.query().trim().toLowerCase();
    const status = this.statusFilter();

    return this.packs()
      .filter((pack) => status === 'all' || pack.status === status)
      .filter((pack) => {
        if (!query) return true;
        return pack.name.toLowerCase().includes(query)
          || (pack.description ?? '').toLowerCase().includes(query);
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  });

  readonly selectedPack = computed(() => {
    const packId = this.selectedPackId();
    return this.packs().find((pack) => pack.id === packId) ?? null;
  });

  readonly questionsById = computed(() => {
    return new Map(this.questions().map((question) => [question.id, question]));
  });

  readonly attachedQuestionIds = computed(() => {
    return new Set(this.memberships().map((membership) => membership.question_id));
  });

  readonly matchingQuestions = computed(() => {
    const query = this.questionQuery().trim().toLowerCase();
    const attached = this.attachedQuestionIds();

    return this.questions()
      .filter((question) => !attached.has(question.id))
      .filter((question) => {
        if (!query) return true;
        return question.stem.toLowerCase().includes(query)
          || (question.topic ?? '').toLowerCase().includes(query);
      });
  });

  readonly availableQuestions = computed(() => this.matchingQuestions().slice(0, 25));

  ngOnInit(): void {
    void this.loadPacks();
  }

  questionCount(packId: string): number {
    return this.questionCounts()[packId] ?? 0;
  }

  questionStem(questionId: string): string {
    const question = this.questionsById().get(questionId);
    if (question) return question.stem;
    if (this.bankLoading()) return 'Loading question…';
    return 'Question unavailable';
  }

  questionTopic(questionId: string): string {
    return this.questionsById().get(questionId)?.topic?.trim() || 'No topic';
  }

  onSearch(event: Event): void {
    this.query.set(this.inputValue(event));
  }

  onQuestionSearch(event: Event): void {
    this.questionQuery.set(this.inputValue(event));
  }

  setFilter(id: 'all' | CrtCompanyPackStatus): void {
    this.statusFilter.set(id);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', description: '' });
    this.revealForm();
  }

  openEdit(id: string): void {
    const pack = this.packs().find((item) => item.id === id);
    if (!pack) {
      this.toast.error('Company pack not found.');
      return;
    }

    this.editingId.set(id);
    this.form.reset({
      name: pack.name,
      description: pack.description ?? ''
    });
    this.revealForm();
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    if (this.isSaving()) return;

    const raw = this.form.getRawValue();
    const input = {
      name: raw.name.trim(),
      description: raw.description.trim()
    };
    this.isSaving.set(true);

    try {
      const editingId = this.editingId();
      if (editingId) {
        await this.packsService.updatePack(editingId, input);
        this.toast.success('Company pack updated.');
      } else {
        await this.packsService.createPack(input);
        this.toast.success('Company pack created as a draft.');
      }
      this.closeForm();
      await this.loadPacks();
    } catch (error: unknown) {
      console.error('Failed to save company pack:', error);
      this.toast.error(this.errorMessage(error, 'Unable to save company pack.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  async publish(pack: CrtAdminCompanyPack): Promise<void> {
    if (pack.status === 'published' || this.busyPackId()) return;
    if (this.questionCount(pack.id) === 0) {
      this.toast.error('Add at least one question before publishing.');
      return;
    }

    this.busyPackId.set(pack.id);
    try {
      await this.packsService.publishPack(pack.id);
      this.toast.success('Company pack published.');
      await this.loadPacks();
    } catch (error: unknown) {
      console.error('Failed to publish company pack:', error);
      this.toast.error(this.errorMessage(error, 'Unable to publish company pack.'));
    } finally {
      this.busyPackId.set(null);
    }
  }

  async unpublish(pack: CrtAdminCompanyPack): Promise<void> {
    if (pack.status !== 'published' || this.busyPackId()) return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'Unpublish company pack',
      message: `Return “${pack.name}” to draft? Students will not see it or start new attempts. Existing attempts, scores, and questions stay.`,
      confirmLabel: 'Unpublish'
    });
    if (!confirmed || this.busyPackId()) return;

    this.busyPackId.set(pack.id);
    try {
      this.replacePack(await this.packsService.unpublishPack(pack.id));
      this.toast.success('Company pack returned to draft.');
    } catch (error: unknown) {
      console.error('Failed to unpublish company pack:', error);
      this.toast.error(this.errorMessage(error, 'Unable to unpublish company pack.'));
    } finally {
      this.busyPackId.set(null);
    }
  }

  async remove(pack: CrtAdminCompanyPack): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete company pack',
      message: `Delete “${pack.name}”? This removes the pack only when it has no student attempts. Question-bank rows are not deleted.`,
      confirmLabel: 'Delete',
      variant: 'danger'
    });
    if (!confirmed || this.busyPackId()) return;

    this.busyPackId.set(pack.id);
    try {
      await this.packsService.deletePack(pack.id);
      if (this.editingId() === pack.id) this.closeForm();
      if (this.selectedPackId() === pack.id) this.closeQuestions();
      this.toast.success('Company pack deleted.');
      await this.loadPacks();
    } catch (error: unknown) {
      console.error('Failed to delete company pack:', error);
      this.toast.error(this.deleteMessage(error));
    } finally {
      this.busyPackId.set(null);
    }
  }

  async openQuestions(packId: string): Promise<void> {
    this.selectedPackId.set(packId);
    this.questionQuery.set('');
    this.bankError.set(null);
    await Promise.all([this.loadMemberships(packId), this.loadQuestionBank()]);
  }

  closeQuestions(): void {
    this.selectedPackId.set(null);
    this.memberships.set([]);
    this.membershipError.set(null);
    this.questionQuery.set('');
  }

  async attach(questionId: string): Promise<void> {
    const packId = this.selectedPackId();
    if (!packId || this.membershipBusy()) return;
    if (this.attachedQuestionIds().has(questionId)) {
      this.toast.error('That question is already attached to this pack.');
      return;
    }

    const nextOrder = this.memberships().reduce(
      (highest, membership) => Math.max(highest, membership.sort_order),
      -1
    ) + 1;

    this.membershipBusy.set(true);
    try {
      await this.packsService.attachQuestion(packId, questionId, nextOrder);
      this.toast.success('Question attached.');
      await this.loadMemberships(packId);
      await this.refreshCount(packId);
    } catch (error: unknown) {
      console.error('Failed to attach company pack question:', error);
      this.toast.error(this.attachMessage(error));
    } finally {
      this.membershipBusy.set(false);
    }
  }

  async saveSort(questionId: string, event: Event): Promise<void> {
    const packId = this.selectedPackId();
    const target = event.target;
    if (!packId || !(target instanceof HTMLInputElement) || this.membershipBusy()) return;

    const sortOrder = Number(target.value);
    const current = this.memberships().find((membership) => membership.question_id === questionId);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      if (current) target.value = String(current.sort_order);
      this.toast.error('Question sort order must be zero or greater.');
      return;
    }
    if (current?.sort_order === sortOrder) return;

    this.membershipBusy.set(true);
    try {
      await this.packsService.updateQuestionSortOrder(packId, questionId, sortOrder);
      this.toast.success('Question order updated.');
      await this.loadMemberships(packId);
    } catch (error: unknown) {
      console.error('Failed to update company pack question order:', error);
      if (current) target.value = String(current.sort_order);
      this.toast.error(this.errorMessage(error, 'Unable to update question order.'));
    } finally {
      this.membershipBusy.set(false);
    }
  }

  async detach(questionId: string): Promise<void> {
    const packId = this.selectedPackId();
    const pack = this.selectedPack();
    if (!packId || !pack || this.membershipBusy()) return;

    const removingLastPublishedQuestion = pack.status === 'published'
      && this.memberships().length === 1
      && this.memberships()[0]?.question_id === questionId;

    const confirmed = await this.confirmDialog.confirm({
      title: removingLastPublishedQuestion ? 'Unpublish and remove question' : 'Remove question',
      message: removingLastPublishedQuestion
        ? 'This is the last question on a published pack. The pack will return to draft before the question is removed. Existing attempts and the question-bank row stay.'
        : 'Remove this question from the pack? The question stays in the question bank.',
      confirmLabel: removingLastPublishedQuestion ? 'Unpublish and remove' : 'Remove',
      variant: 'danger'
    });
    if (!confirmed) return;

    this.membershipBusy.set(true);
    let unpublished = false;
    try {
      if (removingLastPublishedQuestion) {
        this.replacePack(await this.packsService.unpublishPack(packId));
        unpublished = true;
      }
      await this.packsService.removeQuestion(packId, questionId);
      this.toast.success(
        unpublished
          ? 'Pack returned to draft and the question was removed.'
          : 'Question removed from the pack.'
      );
      await this.loadMemberships(packId);
      await this.refreshCount(packId);
    } catch (error: unknown) {
      console.error('Failed to remove company pack question:', error);
      this.toast.error(
        unpublished
          ? 'The pack was returned to draft, but the question could not be removed. It is still attached.'
          : this.errorMessage(error, 'Unable to remove question from the pack.')
      );
    } finally {
      this.membershipBusy.set(false);
    }
  }

  async loadPacks(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const packs = await this.packsService.listPacks();
      const counts: Record<string, number> = {};
      await Promise.all(
        packs.map(async (pack) => {
          const memberships = await this.packsService.listPackQuestions(pack.id);
          counts[pack.id] = memberships.length;
        })
      );
      this.packs.set(packs);
      this.questionCounts.set(counts);
      if (this.selectedPackId() && !packs.some((pack) => pack.id === this.selectedPackId())) {
        this.closeQuestions();
      }
    } catch (error: unknown) {
      console.error('Failed to load company packs:', error);
      this.packs.set([]);
      this.questionCounts.set({});
      const message = this.errorMessage(error, 'Unable to load company packs.');
      this.loadError.set(message);
      this.toast.error(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadMemberships(packId: string): Promise<void> {
    this.membershipLoading.set(true);
    this.membershipError.set(null);
    try {
      const memberships = await this.packsService.listPackQuestions(packId);
      if (this.selectedPackId() !== packId) return;
      this.memberships.set(memberships);
    } catch (error: unknown) {
      console.error('Failed to load company pack questions:', error);
      if (this.selectedPackId() === packId) {
        this.memberships.set([]);
        this.membershipError.set(this.errorMessage(error, 'Unable to load pack questions.'));
      }
    } finally {
      if (this.selectedPackId() === packId) this.membershipLoading.set(false);
    }
  }

  private async loadQuestionBank(): Promise<void> {
    if (this.questions().length > 0 || this.bankLoading()) return;

    this.bankLoading.set(true);
    this.bankError.set(null);
    try {
      this.questions.set(await this.questionsService.listQuestions());
    } catch (error: unknown) {
      console.error('Failed to load CRT question bank:', error);
      this.questions.set([]);
      this.bankError.set(this.errorMessage(error, 'Unable to load the question bank.'));
    } finally {
      this.bankLoading.set(false);
    }
  }

  private replacePack(pack: CrtAdminCompanyPack): void {
    this.packs.update((packs) => packs.map((item) => item.id === pack.id ? pack : item));
  }

  private async refreshCount(packId: string): Promise<void> {
    this.questionCounts.update((counts) => ({
      ...counts,
      [packId]: this.memberships().length
    }));
  }

  private revealForm(): void {
    this.showForm.set(true);
    const timer = setTimeout(() => {
      this.formHost()?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    });
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }

  private inputValue(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  private deleteMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (/foreign key|crt_company_pack_attempts/i.test(message)) {
      return 'This pack has student attempts, so it cannot be deleted. Its attempts and question-bank rows were not changed.';
    }
    return message || 'Unable to delete company pack.';
  }

  private attachMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (/duplicate key|unique/i.test(message)) {
      return 'That question is already attached to this pack.';
    }
    return message || 'Unable to attach question.';
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
