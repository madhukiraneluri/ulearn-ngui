import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LiveSessionService } from '../../services/live-session.service';
import { AuthService } from '../../../core/services/auth.service';
import type { StudentLiveSession } from '../../../models';

@Component({
  selector: 'app-course-sessions-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './course-sessions-panel.html',
  styleUrl: './course-sessions-panel.scss'
})
export class CourseSessionsPanel implements OnInit {
  readonly courseId = input.required<string>();

  private readonly liveSessionService = inject(LiveSessionService);
  private readonly auth = inject(AuthService);

  readonly sessions = signal<StudentLiveSession[]>([]);
  readonly isLoading = signal(true);

  readonly upcomingSessions = signal<StudentLiveSession[]>([]);
  readonly pastSessions = signal<StudentLiveSession[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const user = this.auth.currentUser();
    const courseId = this.courseId();
    if (!user || !courseId) {
      this.sessions.set([]);
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    const list = await this.liveSessionService.listForCourse(courseId, user.id);
    this.sessions.set(list);

    const now = Date.now();
    this.upcomingSessions.set(
      list.filter((s) => {
        if (s.status === 'ended') return false;
        const end = new Date(s.scheduledAt).getTime() + s.durationMinutes * 60 * 1000;
        return s.status === 'live' || end >= now;
      })
    );
    this.pastSessions.set(list.filter((s) => s.status === 'ended'));

    this.isLoading.set(false);
  }

  formatDate(iso: string): string {
    return this.liveSessionService.formatSessionDate(iso);
  }

  joinPath(token: string | null): string | null {
    return token ? this.liveSessionService.joinPath(token) : null;
  }
}
