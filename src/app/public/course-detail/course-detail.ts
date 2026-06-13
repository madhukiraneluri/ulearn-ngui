import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { Course, CurriculumModule, Mentor } from '../../models';
import { CourseService } from '../../shared/services/course.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast';

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
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroy$ = new Subject<void>();

  // Signals
  course = signal<Course | null>(null);
  isLoading = signal(true);
  activeTab = signal<'curriculum' | 'about' | 'mentors'>('curriculum');
  expandedModule = signal<string | null>(null);
  lockMessage = signal<{
    message: string;
    action: 'login' | 'enroll';
    actionLabel: string;
  } | null>(null);
  sidebarPulsing = signal(false);

  // Computed
  isEnrolled = computed(() => false); // Future: check enrollment status

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');

    if (slug) {
      this.courseService
        .getCourseBySlug(slug)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (courseData) => {
            if (courseData) {
              this.course.set(courseData);
              this.isLoading.set(false);
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
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
        actionLabel: 'Enroll Now'
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
    const slug = this.course()?.slug;
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/courses/${slug}` }
      });
    } else {
      this.toast.info('Enrollment coming soon!');
    }
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
