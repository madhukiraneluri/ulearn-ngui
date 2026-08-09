import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Room,
  RoomEvent,
  Track,
  type LocalParticipant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication
} from 'livekit-client';
import { supabase } from '../../core/supabase.client';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast';
import type { SessionRole } from '../../models';

interface LiveKitTokenResponse {
  token: string;
  wsUrl: string;
  roomName: string;
  role: SessionRole;
  sessionId: string;
  error?: string;
}

@Component({
  selector: 'app-session-join',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './session-join.html',
  styleUrl: './session-join.scss'
})
export class SessionJoin implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  private room: Room | null = null;

  readonly localVideo = viewChild<ElementRef<HTMLDivElement>>('localVideo');
  readonly remoteVideos = viewChild<ElementRef<HTMLDivElement>>('remoteVideos');

  readonly isLoading = signal(true);
  readonly isConnecting = signal(false);
  readonly isConnected = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly role = signal<SessionRole | null>(null);
  readonly roomName = signal('');
  readonly micEnabled = signal(true);
  readonly camEnabled = signal(true);

  ngOnInit(): void {
    if (!this.auth.currentUser()) {
      const token = this.route.snapshot.paramMap.get('token') ?? '';
      void this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/s/join/${token}` }
      });
      return;
    }

    void this.connect();
  }

  ngOnDestroy(): void {
    void this.disconnect();
  }

  private inviteToken(): string {
    return this.route.snapshot.paramMap.get('token') ?? '';
  }

  private async connect(): Promise<void> {
    const inviteToken = this.inviteToken();
    if (!inviteToken) {
      this.errorMessage.set('Invalid join link');
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { data, error } = await supabase.functions.invoke<LiveKitTokenResponse>('livekit-token', {
        body: { inviteToken }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.token || !data.wsUrl) {
        throw new Error(data?.error ?? 'Could not get session token');
      }

      this.role.set(data.role);
      this.roomName.set(data.roomName);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true
      });

      this.room = room;

      room
        .on(RoomEvent.TrackSubscribed, (_track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          this.attachRemoteTrack(pub, participant);
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach();
        })
        .on(RoomEvent.LocalTrackPublished, () => {
          this.attachLocalVideo(room.localParticipant);
        })
        .on(RoomEvent.Disconnected, () => {
          this.isConnected.set(false);
        });

      this.isConnecting.set(true);
      await room.connect(data.wsUrl, data.token);

      const canPublish = data.role === 'instructor' || data.role === 'moderator' || data.role === 'student';
      if (canPublish) {
        await room.localParticipant.enableCameraAndMicrophone();
        this.attachLocalVideo(room.localParticipant);
      }

      this.isConnected.set(true);
      this.toast.success('Connected to session');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not join session';
      this.errorMessage.set(msg);
      this.toast.error(msg);
    } finally {
      this.isLoading.set(false);
      this.isConnecting.set(false);
    }
  }

  private attachLocalVideo(participant: LocalParticipant): void {
    const el = this.localVideo()?.nativeElement;
    if (!el) return;

    el.innerHTML = '';
    for (const pub of participant.videoTrackPublications.values()) {
      if (pub.track) {
        el.appendChild(pub.track.attach());
      }
    }
  }

  private attachRemoteTrack(pub: RemoteTrackPublication, participant: RemoteParticipant): void {
    if (!pub.track || pub.kind !== Track.Kind.Video) return;

    const container = this.remoteVideos()?.nativeElement;
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'remote-tile';
    wrapper.dataset['participant'] = participant.identity;

    const label = document.createElement('span');
    label.className = 'participant-name';
    label.textContent = participant.name || participant.identity;

    wrapper.appendChild(pub.track.attach());
    wrapper.appendChild(label);
    container.appendChild(wrapper);
  }

  async toggleMic(): Promise<void> {
    const room = this.room;
    if (!room) return;

    const enabled = !this.micEnabled();
    await room.localParticipant.setMicrophoneEnabled(enabled);
    this.micEnabled.set(enabled);
  }

  async toggleCam(): Promise<void> {
    const room = this.room;
    if (!room) return;

    const enabled = !this.camEnabled();
    await room.localParticipant.setCameraEnabled(enabled);
    this.camEnabled.set(enabled);
    this.attachLocalVideo(room.localParticipant);
  }

  async leaveSession(): Promise<void> {
    await this.disconnect();
    await this.router.navigate(['/my-courses']);
  }

  private async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }

  roleLabel(): string {
    const r = this.role();
    return r ? r.charAt(0).toUpperCase() + r.slice(1) : '';
  }
}
