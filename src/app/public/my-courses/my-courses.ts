import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CourseService } from '../../shared/services/course.service';
import { PaymentService } from '../../shared/services/payment.service';
import { UserEnrolledCourse, CourseCategory } from '../../models';

@Component({
  selector: 'app-my-courses',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-courses.html',
  styleUrl: './my-courses.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyCourses implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly courseService = inject(CourseService);
  private readonly paymentService = inject(PaymentService);

  readonly myCourses = signal<UserEnrolledCourse[]>([]);
  readonly isLoading = signal(true);
  readonly filterBy = signal<'all' | 'in-progress' | 'completed'>('all');

  readonly filteredCourses = computed(() => {
    const courses = this.myCourses();
    switch (this.filterBy()) {
      case 'in-progress':
        return courses.filter((c) => c.progress > 0 && c.progress < 100);
      case 'completed':
        return courses.filter((c) => c.progress === 100);
      default:
        return courses;
    }
  });

  readonly inProgressCount = computed(() =>
    this.myCourses().filter((c) => c.progress > 0 && c.progress < 100).length
  );

  readonly completedCount = computed(() =>
    this.myCourses().filter((c) => c.progress === 100).length
  );

  ngOnInit(): void {
    this.paymentService.unlockPageScroll();
    void this.loadCourses();
  }

  ngOnDestroy(): void {
    this.paymentService.unlockPageScroll();
  }

  private async loadCourses(): Promise<void> {
    this.isLoading.set(true);
    const user = this.auth.currentUser();
    if (!user) {
      this.myCourses.set([]);
      this.isLoading.set(false);
      return;
    }

    const courses = await this.courseService.getUserEnrolledCourses(user.id);
    this.myCourses.set(courses);
    this.isLoading.set(false);
  }

  setFilter(filter: 'all' | 'in-progress' | 'completed'): void {
    this.filterBy.set(filter);
  }

  continueCourse(course: UserEnrolledCourse): void {
    if (course.firstLessonId) {
      this.router.navigate(['/learn', course.slug, course.firstLessonId]);
    } else {
      this.router.navigate(['/courses', course.slug]);
    }
  }

  getProgressColor(progress: number): string {
    if (progress === 100) return '#4CAF50';
    if (progress >= 75) return '#8BC34A';
    if (progress >= 50) return '#FFC107';
    return '#FF9800';
  }

  getCategoryColor(category: CourseCategory): string {
    const colors: Record<CourseCategory, string> = {
      technical: '#8B6FBE',
      creative: '#F4845F',
      business: '#4CAF50',
    };
    return colors[category];
  }

  getCategoryLabel(category: CourseCategory): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }
}
