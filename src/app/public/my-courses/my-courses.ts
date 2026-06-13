import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface CourseProgress {
  id: string;
  title: string;
  category: string;
  progress: number;
  instructor: string;
  enrolledDate: string;
  lastAccessed: string;
}

@Component({
  selector: 'app-my-courses',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-courses.html',
  styleUrl: './my-courses.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyCourses implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly myCourses = signal<CourseProgress[]>([]);
  readonly isLoading = signal(false);
  readonly filterBy = signal<'all' | 'in-progress' | 'completed'>('all');

  ngOnInit(): void {
    this.loadCourses();
  }

  private loadCourses(): void {
    this.isLoading.set(true);
    // Mock data - in production, this would fetch from API
    setTimeout(() => {
      this.myCourses.set([
        {
          id: '1',
          title: 'Web Development Fundamentals',
          category: 'Technical',
          progress: 65,
          instructor: 'John Doe',
          enrolledDate: '2024-01-15',
          lastAccessed: '2024-06-02'
        },
        {
          id: '2',
          title: 'Advanced JavaScript',
          category: 'Technical',
          progress: 100,
          instructor: 'Jane Smith',
          enrolledDate: '2023-11-20',
          lastAccessed: '2024-05-28'
        },
        {
          id: '3',
          title: 'UI/UX Design Principles',
          category: 'Creative',
          progress: 45,
          instructor: 'Mike Johnson',
          enrolledDate: '2024-02-10',
          lastAccessed: '2024-06-01'
        },
        {
          id: '4',
          title: 'Business Analytics',
          category: 'Business',
          progress: 20,
          instructor: 'Sarah Williams',
          enrolledDate: '2024-04-05',
          lastAccessed: '2024-05-30'
        }
      ]);
      this.isLoading.set(false);
    }, 800);
  }

  setFilter(filter: 'all' | 'in-progress' | 'completed'): void {
    this.filterBy.set(filter);
  }

  getFilteredCourses(): CourseProgress[] {
    const courses = this.myCourses();
    switch (this.filterBy()) {
      case 'in-progress':
        return courses.filter(c => c.progress > 0 && c.progress < 100);
      case 'completed':
        return courses.filter(c => c.progress === 100);
      default:
        return courses;
    }
  }

  continueCourse(courseId: string): void {
    this.router.navigate(['/courses', courseId]);
  }

  getProgressColor(progress: number): string {
    if (progress === 100) return '#4CAF50';
    if (progress >= 75) return '#8BC34A';
    if (progress >= 50) return '#FFC107';
    return '#FF9800';
  }

  getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      'Technical': '#667eea',
      'Creative': '#FF6B6B',
      'Business': '#4ECDC4',
      'default': '#95a3b3'
    };
    return colors[category] || colors['default'];
  }
}
