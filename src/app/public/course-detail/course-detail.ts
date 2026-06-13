import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  HostListener,
  signal,
  inject
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { Course, CurriculumModule, Mentor } from '../../models';
import { CourseService } from '../../shared/services/course.service';
import { PaymentService } from '../../shared/services/payment.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast';
import {
  formatClassHours,
  formatModuleClasses,
  formatModuleTitle,
  formatLessonTitle,
  resolveClassCount
} from '../../shared/utils/course-format.util';

@Component({
  selector: 'app-course-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './course-detail.html',
  styleUrl: './course-detail.scss'
})
export class CourseDetail implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly courseService = inject(CourseService);
  private readonly paymentService = inject(PaymentService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroy$ = new Subject<void>();

  // Signals
  course = signal<Course | null>(null);
  isLoading = signal(true);
  expandedModule = signal<string | null>(null);
  lockMessage = signal<{
    message: string;
    action: 'login' | 'enroll';
    actionLabel: string;
  } | null>(null);
  sidebarPulsing = signal(false);

  // Computed
  isEnrolled = signal(false);

  ngOnInit(): void {
    this.paymentService.unlockPageScroll();
    const slug = this.route.snapshot.paramMap.get('slug');
    const enrollAfterLogin = this.route.snapshot.queryParamMap.get('enroll') === 'true';

    if (slug) {
      this.courseService
        .getCourseBySlug(slug)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (courseData) => {
            if (courseData) {
              this.course.set(courseData);
              this.isLoading.set(false);

              const firstModule = courseData.curriculum.find((m) => m.order === 1);
              if (firstModule) {
                this.expandedModule.set(firstModule.id);
              }

              if (this.auth.isLoggedIn()) {
                const user = this.auth.currentUser();
                if (user) {
                  void this.courseService
                    .isUserEnrolled(courseData.id, user.id)
                    .then((v) => {
                      this.isEnrolled.set(v);
                      if (enrollAfterLogin && !v) {
                        void this.handleEnrollClick();
                      }
                    });
                }
              } else if (enrollAfterLogin) {
                this.router.navigate(['/auth/login'], {
                  queryParams: { returnUrl: `/courses/${slug}?enroll=true` }
                });
              }
            } else {
              this.isLoading.set(false);
            }
          },
          error: (err) => {
            console.error('Error loading course:', err);
            this.isLoading.set(false);
            this.toast.error('Failed to load course');
          }
        });
    } else {
      this.isLoading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.paymentService.unlockPageScroll();
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    void this.refreshEnrollmentStatus();
  }

  private async refreshEnrollmentStatus(): Promise<void> {
    const course = this.course();
    const user = this.auth.currentUser();
    if (!course || !user || !this.auth.isLoggedIn()) return;

    const enrolled = await this.courseService.isUserEnrolled(course.id, user.id);
    this.isEnrolled.set(enrolled);
  }

  continueLearning(): void {
    const course = this.course();
    const firstLesson = course?.curriculum[0]?.lessons[0];
    if (course && firstLesson) {
      this.router.navigate(['/learn', course.slug, firstLesson.id]);
    }
  }

  canAccessModule(module: CurriculumModule): boolean {
    return module.order === 1 || this.isEnrolled();
  }

  handleModuleClick(module: CurriculumModule): void {
    if (this.canAccessModule(module)) {
      this.expandedModule.update((current) =>
        current === module.id ? null : module.id
      );
      this.lockMessage.set(null);
    } else if (!this.auth.isLoggedIn()) {
      this.lockMessage.set({
        message: 'Log in to access this lesson',
        action: 'login',
        actionLabel: 'Log In'
      });
      this.triggerSidebarPulse();
    } else {
      this.lockMessage.set({
        message: 'Enroll to unlock all modules',
        action: 'enroll',
        actionLabel: 'Pay & Enroll'
      });
      this.triggerSidebarPulse();
    }
  }

  handleLockAction(): void {
    const action = this.lockMessage()?.action;
    if (action === 'login') {
      const slug = this.course()?.slug;
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/courses/${slug}` }
      });
    } else if (action === 'enroll') {
      this.handleEnrollClick();
    }
  }

  handleEnrollClick(): void {
    const course = this.course();
    if (!course) return;

    if (this.auth.isLoggedIn() && this.isEnrolled()) {
      this.continueLearning();
      return;
    }

    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/courses/${course.slug}?enroll=true` }
      });
      return;
    }

    this.paymentService.setPendingEnrollment({
      courseId: course.id,
      slug: course.slug,
      price: course.price,
      title: course.title
    });

    void this.paymentService.startCheckout({
      courseId: course.id,
      slug: course.slug,
      price: course.price,
      title: course.title
    });
  }

  handleLessonClick(module: CurriculumModule, lesson: CurriculumModule['lessons'][number]): void {
    if (!this.canAccessModule(module)) {
      if (!this.auth.isLoggedIn()) {
        const slug = this.course()?.slug;
        this.router.navigate(['/auth/login'], {
          queryParams: { returnUrl: `/learn/${slug}/${lesson.id}` }
        });
        return;
      }
      this.lockMessage.set({
        message: 'Enroll to access this class',
        action: 'enroll',
        actionLabel: 'Pay & Enroll'
      });
      this.triggerSidebarPulse();
      return;
    }

    const slug = this.course()?.slug;
    if (slug) {
      this.router.navigate(['/learn', slug, lesson.id]);
    }
  }

  formatCourseSchedule(): string {
    const c = this.course();
    if (!c) return '';
    if (c.courseFormat === '45-day' && c.durationDays) {
      return `${c.durationDays} days`;
    }
    if (c.courseFormat === '3-month' && c.weeklyHours) {
      return `3 months · ${c.weeklyHours} hrs/week`;
    }
    return `${c.durationMonths} months`;
  }

  formatClassHours(): string {
    const c = this.course();
    if (!c) return '';
    return formatClassHours({
      classCount: resolveClassCount(c),
      hoursPerClass: c.hoursPerClass,
      totalLessons: c.totalLessons
    });
  }

  formatModuleClasses(module: CurriculumModule): string {
    const c = this.course();
    return formatModuleClasses(
      module.lessons.length,
      this.getTotalLessonDuration(module),
      c?.hoursPerClass
    );
  }

  formatModuleTitle(module: CurriculumModule): string {
    return formatModuleTitle(module.order, module.title);
  }

  formatLessonTitle(lesson: CurriculumModule['lessons'][number]): string {
    return formatLessonTitle(lesson.title);
  }

  resolveClassCount(): number {
    const c = this.course();
    return c ? resolveClassCount(c) : 0;
  }

  handleSecondaryButtonClick(): void {
    if (!this.auth.isLoggedIn()) {
      const slug = this.course()?.slug;
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/courses/${slug}` }
      });
    }
  }

  navigateToAllCourses(): void {
    this.router.navigate(['/courses']);
  }

  formatPrice(price: number): string {
    return '₹' + price.toLocaleString('en-IN');
  }

  getDiscount(price: number, originalPrice: number): number {
    return Math.round((1 - price / originalPrice) * 100);
  }

  getCategoryColor(category: string): string {
    const colorMap: Record<string, string> = {
      technical: 'var(--purple)',
      creative: 'var(--orange)',
      business: 'var(--green)'
    };
    return colorMap[category] || 'var(--purple)';
  }

  getCategoryTagBg(category: string): string {
    const bgMap: Record<string, string> = {
      technical: 'rgba(139, 111, 190, 0.15)',
      creative: 'rgba(244, 132, 95, 0.15)',
      business: 'rgba(76, 175, 80, 0.15)'
    };
    return bgMap[category] || 'rgba(139, 111, 190, 0.15)';
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  getTotalLessonDuration(module: CurriculumModule): number {
    return module.lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0);
  }

  getFirstFreeLessonIndex(): number {
    const course = this.course();
    if (!course || course.curriculum.length === 0) return -1;
    const firstModule = course.curriculum[0];
    return firstModule.lessons.findIndex((lesson) => lesson.isFree);
  }

  shouldShowLockOverlay(module: CurriculumModule): boolean {
    return !this.canAccessModule(module);
  }

  isModuleExpanded(moduleId: string): boolean {
    return this.expandedModule() === moduleId;
  }

  triggerSidebarPulse(): void {
    this.sidebarPulsing.set(true);
    setTimeout(() => this.sidebarPulsing.set(false), 1200);
  }

  getCategoryLabel(category: string): string {
    const labelMap: Record<string, string> = {
      technical: 'Technical',
      creative: 'Creative',
      business: 'Business'
    };
    return labelMap[category] || category;
  }
}
