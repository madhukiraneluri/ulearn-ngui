import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss'
})
export class AdminLayout {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly sidebarOpen = signal(false);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: '📊' },
    { label: 'Courses', path: '/admin/courses', icon: '📚' },
    { label: 'Curriculum', path: '/admin/curriculum', icon: '📋' },
    { label: 'Enrollments', path: '/admin/enrollments', icon: '📝' },
    { label: 'Students', path: '/admin/students', icon: '👥' },
    { label: 'Mentors', path: '/admin/mentors', icon: '🧑‍🏫' },
    { label: 'Blogs', path: '/admin/blogs', icon: '📝' },
    { label: 'Internships', path: '/admin/internships', icon: '💼' },
    { label: 'Applications', path: '/admin/internship-applications', icon: '📨' },
    { label: 'Papers', path: '/admin/papers', icon: '📄' },
    { label: 'Student Stories', path: '/admin/student-stories', icon: '⭐' }
  ];

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  async logout(): Promise<void> {
    await this.auth.signOut('/auth/admin');
    await this.router.navigate(['/auth/admin']);
  }
}
