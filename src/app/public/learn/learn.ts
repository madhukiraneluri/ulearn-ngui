import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Course, CurriculumLesson, LessonWithBlocks } from '../../models';
import { LearnService } from '../../shared/services/learn.service';
import { CourseService } from '../../shared/services/course.service';
import { EnrollmentAccessService } from '../../shared/services/enrollment-access.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast';
import { EnrollModal } from '../../shared/components/enroll-modal/enroll-modal';
import { Subject, takeUntil } from 'rxjs';
import { BlockHeading } from '../../shared/components/blocks/block-heading/block-heading';
import { BlockText } from '../../shared/components/blocks/block-text/block-text';
import { BlockImage } from '../../shared/components/blocks/block-image/block-image';
import { BlockTwoColumn } from '../../shared/components/blocks/block-two-column/block-two-column';
import { BlockCallout } from '../../shared/components/blocks/block-callout/block-callout';
import { BlockCode } from '../../shared/components/blocks/block-code/block-code';
import { BlockQuote } from '../../shared/components/blocks/block-quote/block-quote';
import { BlockDivider } from '../../shared/components/blocks/block-divider/block-divider';
import { BlockGallery } from '../../shared/components/blocks/block-gallery/block-gallery';
import { BlockVideo } from '../../shared/components/blocks/block-video/block-video';
import { formatModuleTitle, formatLessonTitle } from '../../shared/utils/course-format.util';

interface SidebarLesson extends CurriculumLesson {
  moduleId: string;
  moduleOrder: number;
}

@Component({
  selector: 'app-learn',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    EnrollModal,
    BlockHeading,
    BlockText,
    BlockImage,
    BlockTwoColumn,
    BlockCallout,
    BlockCode,
    BlockQuote,
    BlockDivider,
    BlockGallery,
    BlockVideo
  ],
  templateUrl: './learn.html',
  styleUrl: './learn.scss'
})
export class Learn implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly learnService = inject(LearnService);
  private readonly courseService = inject(CourseService);
  private readonly accessService = inject(EnrollmentAccessService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  course = signal<Course | null>(null);
  currentLesson = signal<LessonWithBlocks | null>(null);
  isLoading = signal(true);
  expandedModule = signal<string | null>(null);
  isEnrolled = signal(false);
  unlockedModuleIds = signal<Set<string>>(new Set());
  contentLocked = signal(false);
  completedLessonIds = signal<Set<string>>(new Set());
  markingComplete = signal(false);
  showEnrollPrompt = signal(false);
  showEnrollModal = signal(false);
  sidebarOpen = signal(false);

  flatLessons = computed(() => {
    const c = this.course();
    return c ? this.learnService.flattenLessons(c) : [];
  });

  currentIndex = computed(() => {
    const lesson = this.currentLesson();
    if (!lesson) return -1;
    return this.flatLessons().findIndex((l) => l.id === lesson.id);
  });

  previousLesson = computed(() => {
    const idx = this.currentIndex();
    if (idx <= 0) return null;
    return this.flatLessons()[idx - 1];
  });

  nextLesson = computed(() => {
    const idx = this.currentIndex();
    const flat = this.flatLessons();
    if (idx < 0 || idx >= flat.length - 1) return null;
    return flat[idx + 1];
  });

  progressPercent = computed(() => {
    const flat = this.flatLessons();
    if (flat.length === 0) return 0;
    const done = this.completedLessonIds().size;
    return Math.round((done / flat.length) * 100);
  });

  isCurrentLessonComplete = computed(() => {
    const id = this.currentLesson()?.id;
    return id ? this.completedLessonIds().has(id) : false;
  });

  canTrackProgress = computed(() => this.isEnrolled() && !this.contentLocked());

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isLoading.set(true);
      void this.loadPage();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadPage(): Promise<void> {
    const courseSlug = this.route.snapshot.paramMap.get('courseSlug');
    const lessonId = this.route.snapshot.paramMap.get('lessonId');

    if (!courseSlug || !lessonId) {
      this.isLoading.set(false);
      return;
    }

    const course = await this.learnService.getCourse(courseSlug);
    if (!course) {
      this.isLoading.set(false);
      return;
    }

    this.course.set(course);

    const lesson = await this.learnService.getLessonWithBlocks(lessonId);
    if (!lesson) {
      this.isLoading.set(false);
      this.toast.error('Lesson not found');
      return;
    }

    const canView = await this.checkAccess(course, lesson);
    if (!canView) return;

    this.currentLesson.set(lesson);
    this.expandedModule.set(lesson.moduleId);

    if (this.auth.isLoggedIn()) {
      const user = this.auth.currentUser();
      if (user) {
        const flat = this.learnService.flattenLessons(course);
        const progress = await this.learnService.getLessonProgress(
          user.id,
          flat.map((l) => l.id)
        );
        this.completedLessonIds.set(
          new Set(progress.filter((p) => p.completed).map((p) => p.lessonId))
        );
      }
    }

    this.isLoading.set(false);
  }

  private async checkAccess(
    course: Course,
    lesson: LessonWithBlocks
  ): Promise<boolean> {
    const courseSlug = course.slug;
    const lessonId = lesson.id;
    const returnUrl = `/learn/${courseSlug}/${lessonId}`;

    if (!this.auth.isLoggedIn()) {
      await this.router.navigate(['/auth/login'], { queryParams: { returnUrl } });
      return false;
    }

    const user = this.auth.currentUser();
    if (!user) return false;

    const enrolled = await this.courseService.isUserEnrolled(course.id, user.id);
    this.isEnrolled.set(enrolled);

    if (!enrolled) {
      await this.router.navigate(['/courses', courseSlug], {
        queryParams: { enroll: 'true' }
      });
      return false;
    }

    const unlocked = await this.accessService.getUnlockedModuleIds(user.id, course.id);
    this.unlockedModuleIds.set(unlocked);

    const hasContentAccess = unlocked.has(lesson.moduleId);
    this.contentLocked.set(!hasContentAccess);

    return true;
  }

  canAccessLesson(lesson: SidebarLesson): boolean {
    return this.isEnrolled() && this.unlockedModuleIds().has(lesson.moduleId);
  }

  isLessonLocked(lesson: SidebarLesson): boolean {
    return !this.canAccessLesson(lesson);
  }

  toSidebarLesson(
    lesson: CurriculumLesson,
    moduleId: string,
    moduleOrder: number
  ): SidebarLesson {
    return { ...lesson, moduleId, moduleOrder };
  }

  isLessonActive(lessonId: string): boolean {
    return this.currentLesson()?.id === lessonId;
  }

  isLessonCompleted(lessonId: string): boolean {
    return this.completedLessonIds().has(lessonId);
  }

  toggleModule(moduleId: string): void {
    this.expandedModule.update((cur) => (cur === moduleId ? null : moduleId));
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  navigateToLesson(lesson: SidebarLesson): void {
    if (this.isLessonLocked(lesson)) {
      this.handleLockedLessonClick(lesson);
      return;
    }

    const slug = this.course()?.slug;
    if (!slug) return;

    this.showEnrollPrompt.set(false);
    this.closeSidebar();
    this.router.navigate(['/learn', slug, lesson.id]);
  }

  handleLockedLessonClick(lesson: SidebarLesson): void {
    const slug = this.course()?.slug;
    if (!slug) return;

    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/learn/${slug}/${lesson.id}` }
      });
      return;
    }

    if (!this.isEnrolled()) {
      this.showEnrollModal.set(true);
      return;
    }

    this.showEnrollPrompt.set(true);
  }

  onLockedLockClick(event: Event, lesson: SidebarLesson): void {
    event.stopPropagation();
    this.handleLockedLessonClick(lesson);
  }

  dismissEnrollPrompt(): void {
    this.showEnrollPrompt.set(false);
  }

  enrollInCourse(): void {
    const course = this.course();
    if (!course) return;

    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/courses/${course.slug}?enroll=true` }
      });
      return;
    }

    this.showEnrollModal.set(true);
  }

  closeEnrollModal(): void {
    this.showEnrollModal.set(false);
  }

  async markComplete(): Promise<void> {
    if (!this.canTrackProgress()) return;

    const lesson = this.currentLesson();
    const user = this.auth.currentUser();
    if (!lesson || !user) {
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/learn/${this.course()?.slug}/${lesson?.id}` }
      });
      return;
    }

    this.markingComplete.set(true);
    const ok = await this.learnService.markLessonComplete(user.id, lesson.id);
    this.markingComplete.set(false);

    if (ok) {
      const course = this.course();
      if (course) {
        const flat = this.learnService.flattenLessons(course);
        const progress = await this.learnService.getLessonProgress(
          user.id,
          flat.map((l) => l.id)
        );
        this.completedLessonIds.set(
          new Set(progress.filter((p) => p.completed).map((p) => p.lessonId))
        );
      } else {
        this.completedLessonIds.update((set) => new Set([...set, lesson.id]));
      }
      this.toast.success('Lesson marked complete');
    } else {
      this.toast.error('Could not save progress');
    }
  }

  goPrevious(): void {
    const prev = this.previousLesson();
    const slug = this.course()?.slug;
    if (!prev || !slug) return;
    if (this.isLessonLocked(prev as SidebarLesson)) {
      this.handleLockedLessonClick(prev as SidebarLesson);
      return;
    }
    this.router.navigate(['/learn', slug, prev.id]);
  }

  goNext(): void {
    const next = this.nextLesson();
    const slug = this.course()?.slug;
    if (!next || !slug) return;
    if (this.isLessonLocked(next as SidebarLesson)) {
      this.handleLockedLessonClick(next as SidebarLesson);
      return;
    }
    this.router.navigate(['/learn', slug, next.id]);
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  formatModuleTitle(order: number, title: string): string {
    return formatModuleTitle(order, title);
  }

  formatLessonTitle(title: string): string {
    return formatLessonTitle(title);
  }
}
