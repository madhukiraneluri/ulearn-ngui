import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LiveSessionJoinService } from '../../shared/services/live-session-join.service';
import type { SessionRole } from '../../models';
import { SessionJoinLobby, type LobbyJoinChoice } from './session-join-lobby/session-join-lobby';
import { SessionRoom } from './session-room/session-room';

type JoinStep = 'loading' | 'error' | 'lobby' | 'room';

@Component({
  selector: 'app-session-join',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, SessionJoinLobby, SessionRoom],
  templateUrl: './session-join.html',
  styleUrl: './session-join.scss'
})
export class SessionJoin implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly joinAccess = inject(LiveSessionJoinService);

  readonly step = signal<JoinStep>('loading');
  readonly errorMessage = signal<string | null>(null);
  readonly sessionTitle = signal('');
  readonly role = signal<SessionRole>('student');
  readonly joinMic = signal(true);
  readonly joinCam = signal(true);

  ngOnInit(): void {
    void this.initialize();
  }

  inviteToken(): string {
    return this.route.snapshot.paramMap.get('token') ?? '';
  }

  private loginReturnUrl(): string {
    return `/s/join/${this.inviteToken()}`;
  }

  private async initialize(): Promise<void> {
    const inviteToken = this.inviteToken();
    if (!inviteToken) {
      this.errorMessage.set('Invalid join link');
      this.step.set('error');
      return;
    }

    const isLoggedIn = await this.auth.ensureSessionChecked();
    if (!isLoggedIn) {
      await this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: this.loginReturnUrl() }
      });
      return;
    }

    const user = this.auth.currentUser();
    if (!user) {
      await this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: this.loginReturnUrl() }
      });
      return;
    }

    const access = await this.joinAccess.validateAccess(inviteToken, user.id);
    this.sessionTitle.set(access.sessionTitle ?? 'Live session');
    this.role.set(access.role ?? 'student');

    if (!access.allowed) {
      this.errorMessage.set(access.message);
      this.step.set('error');
      return;
    }

    this.step.set('lobby');
  }

  onLobbyJoin(choice: LobbyJoinChoice): void {
    this.joinMic.set(choice.enableMic);
    this.joinCam.set(choice.enableCam);
    this.step.set('room');
  }

  onLobbyJoinWithoutDevices(): void {
    this.joinMic.set(false);
    this.joinCam.set(false);
    this.step.set('room');
  }

  async onLeaveSession(): Promise<void> {
    await this.router.navigate(['/my-courses']);
  }
}
