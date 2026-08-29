import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Room,
  RoomEvent,
  Track,
  type LocalParticipant,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication
} from 'livekit-client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../../core/supabase.client';
import { ToastService } from '../../../core/services/toast';
import { SessionRoomControlService } from '../../../shared/services/session-room-control.service';
import type { SessionRole, SessionRoomSettings } from '../../../models';

interface LiveKitTokenResponse {
  token: string;
  wsUrl: string;
  roomName: string;
  role: SessionRole;
  sessionId: string;
  roomSettings: SessionRoomSettings;
  error?: string;
}

interface RoomStateMessage {
  type: 'ROOM_STATE';
  settings: SessionRoomSettings;
}

export interface ParticipantView {
  identity: string;
  name: string;
  role: SessionRole;
  isLocal: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  isScreenSharing: boolean;
}

@Component({
  selector: 'app-session-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './session-room.html',
  styleUrl: './session-room.scss'
})
export class SessionRoom implements OnInit, OnDestroy {
  private readonly toast = inject(ToastService);
  private readonly roomControl = inject(SessionRoomControlService);

  readonly inviteToken = input.required<string>();
  readonly sessionTitle = input.required<string>();
  readonly initialMic = input(true);
  readonly initialCam = input(true);

  readonly leaveSession = output<void>();

  readonly screenShareStage = viewChild<ElementRef<HTMLDivElement>>('screenShareStage');
  readonly remoteVideos = viewChild<ElementRef<HTMLDivElement>>('remoteVideos');
  readonly localVideo = viewChild<ElementRef<HTMLDivElement>>('localVideo');

  readonly isConnecting = signal(true);
  readonly isConnected = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly role = signal<SessionRole>('student');
  readonly sessionId = signal('');
  readonly roomName = signal('');
  readonly micEnabled = signal(true);
  readonly camEnabled = signal(true);
  readonly screenShareEnabled = signal(false);
  readonly showParticipantPanel = signal(false);
  readonly roomSettings = signal<SessionRoomSettings>({
    allowStudentMic: true,
    allowStudentCamera: true,
    allowStudentUnmute: true
  });
  readonly participants = signal<ParticipantView[]>([]);
  readonly controlBusy = signal(false);

  private room: Room | null = null;
  private screenShareIdentity: string | null = null;

  ngOnInit(): void {
    void this.connect();
  }

  ngOnDestroy(): void {
    void this.disconnect();
  }

  isInstructorOrModerator(): boolean {
    const r = this.role();
    return r === 'instructor' || r === 'moderator';
  }

  canControlMic(): boolean {
    if (this.isInstructorOrModerator()) return true;
    const settings = this.roomSettings();
    return settings.allowStudentMic && settings.allowStudentUnmute;
  }

  canControlCam(): boolean {
    if (this.isInstructorOrModerator()) return true;
    return this.roomSettings().allowStudentCamera;
  }

  roleLabel(): string {
    const r = this.role();
    return r.charAt(0).toUpperCase() + r.slice(1);
  }

  toggleParticipantPanel(): void {
    this.showParticipantPanel.update((v) => !v);
  }

  async toggleMic(): Promise<void> {
    const room = this.room;
    if (!room) return;

    const next = !this.micEnabled();
    if (next && !this.canControlMic()) {
      this.toast.error('The instructor has disabled unmuting');
      return;
    }

    await room.localParticipant.setMicrophoneEnabled(next);
    this.micEnabled.set(next);
    this.refreshParticipants();
  }

  async toggleCam(): Promise<void> {
    const room = this.room;
    if (!room) return;

    const next = !this.camEnabled();
    if (next && !this.canControlCam()) {
      this.toast.error('The instructor has disabled camera');
      return;
    }

    await room.localParticipant.setCameraEnabled(next);
    this.camEnabled.set(next);
    this.attachLocalVideo(room.localParticipant);
    this.refreshParticipants();
  }

  async toggleScreenShare(): Promise<void> {
    const room = this.room;
    if (!room || !this.isInstructorOrModerator()) return;

    const next = !this.screenShareEnabled();
    await room.localParticipant.setScreenShareEnabled(next);
    this.screenShareEnabled.set(next);
    this.refreshParticipants();
  }

  async muteAll(): Promise<void> {
    if (!this.isInstructorOrModerator()) return;
    await this.runControl(() => this.roomControl.muteAll(this.sessionId()));
  }

  async allowUnmute(): Promise<void> {
    if (!this.isInstructorOrModerator()) return;
    await this.runControl(() => this.roomControl.allowUnmute(this.sessionId()));
  }

  async disallowUnmute(): Promise<void> {
    if (!this.isInstructorOrModerator()) return;
    await this.runControl(() => this.roomControl.disallowUnmute(this.sessionId()));
  }

  async toggleAllowStudentMic(): Promise<void> {
    if (!this.isInstructorOrModerator()) return;
    const current = this.roomSettings();
    await this.runControl(() =>
      this.roomControl.updateSettings(this.sessionId(), {
        allowStudentMic: !current.allowStudentMic
      })
    );
  }

  async toggleAllowStudentCamera(): Promise<void> {
    if (!this.isInstructorOrModerator()) return;
    const current = this.roomSettings();
    await this.runControl(() =>
      this.roomControl.updateSettings(this.sessionId(), {
        allowStudentCamera: !current.allowStudentCamera
      })
    );
  }

  async muteParticipant(identity: string): Promise<void> {
    if (!this.isInstructorOrModerator() || identity === this.room?.localParticipant.identity) return;
    await this.runControl(() => this.roomControl.muteParticipant(this.sessionId(), identity));
  }

  onLeave(): void {
    void this.disconnect().then(() => this.leaveSession.emit());
  }

  private async connect(): Promise<void> {
    this.isConnecting.set(true);
    this.errorMessage.set(null);

    try {
      const { data, error } = await supabase.functions.invoke<LiveKitTokenResponse>('livekit-token', {
        body: { inviteToken: this.inviteToken() }
      });

      if (error) {
        throw new Error(await this.formatInvokeError(error));
      }

      if (!data?.token || !data.wsUrl) {
        throw new Error(data?.error ?? 'Could not get session token');
      }

      this.role.set(data.role);
      this.sessionId.set(data.sessionId);
      this.roomName.set(data.roomName);
      this.roomSettings.set(data.roomSettings);

      const room = new Room({ adaptiveStream: true, dynacast: true });
      this.room = room;

      room
        .on(RoomEvent.TrackSubscribed, (_track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          this.attachRemoteTrack(pub, participant);
          this.refreshParticipants();
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          track.detach();
          if (pub.source === Track.Source.ScreenShare) {
            this.clearScreenShare(participant.identity);
          }
          this.removeRemoteTile(participant.identity);
          this.refreshParticipants();
        })
        .on(RoomEvent.LocalTrackPublished, () => {
          this.attachLocalVideo(room.localParticipant);
          this.refreshParticipants();
        })
        .on(RoomEvent.LocalTrackUnpublished, (pub) => {
          if (pub.source === Track.Source.ScreenShare) {
            this.clearScreenShare(room.localParticipant.identity);
          }
          this.refreshParticipants();
        })
        .on(RoomEvent.ParticipantConnected, () => this.refreshParticipants())
        .on(RoomEvent.ParticipantDisconnected, () => this.refreshParticipants())
        .on(RoomEvent.TrackMuted, () => this.refreshParticipants())
        .on(RoomEvent.TrackUnmuted, () => this.refreshParticipants())
        .on(RoomEvent.DataReceived, (payload) => this.handleDataMessage(payload))
        .on(RoomEvent.Disconnected, () => {
          this.isConnected.set(false);
        });

      await room.connect(data.wsUrl, data.token);

      const mic = this.initialMic() && this.canPublishMic(data.role, data.roomSettings);
      const cam = this.initialCam() && this.canPublishCam(data.role, data.roomSettings);

      if (mic || cam) {
        await room.localParticipant.setMicrophoneEnabled(mic);
        await room.localParticipant.setCameraEnabled(cam);
      } else {
        await room.localParticipant.setMicrophoneEnabled(false);
        await room.localParticipant.setCameraEnabled(false);
      }

      this.micEnabled.set(mic);
      this.camEnabled.set(cam);
      this.attachLocalVideo(room.localParticipant);
      this.refreshParticipants();

      this.isConnected.set(true);
      this.toast.success('Connected to session');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not join session';
      this.errorMessage.set(msg);
      this.toast.error(msg);
    } finally {
      this.isConnecting.set(false);
    }
  }

  private canPublishMic(role: SessionRole, settings: SessionRoomSettings): boolean {
    if (role === 'instructor' || role === 'moderator') return true;
    return settings.allowStudentMic;
  }

  private canPublishCam(role: SessionRole, settings: SessionRoomSettings): boolean {
    if (role === 'instructor' || role === 'moderator') return true;
    return settings.allowStudentCamera;
  }

  private async runControl(
    action: () => Promise<{ ok: boolean; settings?: SessionRoomSettings; error?: string }>
  ): Promise<void> {
    if (this.controlBusy()) return;
    this.controlBusy.set(true);
    try {
      const result = await action();
      if (!result.ok) {
        this.toast.error(result.error ?? 'Action failed');
        return;
      }
      if (result.settings) {
        this.applyRoomSettings(result.settings);
        await this.broadcastRoomState(result.settings);
      }
      this.refreshParticipants();
    } finally {
      this.controlBusy.set(false);
    }
  }

  private applyRoomSettings(settings: SessionRoomSettings): void {
    this.roomSettings.set(settings);

    const room = this.room;
    const role = this.role();
    if (!room || role === 'instructor' || role === 'moderator') return;

    if (!settings.allowStudentMic || !settings.allowStudentUnmute) {
      void room.localParticipant.setMicrophoneEnabled(false);
      this.micEnabled.set(false);
    }

    if (!settings.allowStudentCamera) {
      void room.localParticipant.setCameraEnabled(false);
      this.camEnabled.set(false);
      this.attachLocalVideo(room.localParticipant);
    }
  }

  private async broadcastRoomState(settings: SessionRoomSettings): Promise<void> {
    const room = this.room;
    if (!room || !this.isInstructorOrModerator()) return;

    const message: RoomStateMessage = { type: 'ROOM_STATE', settings };
    const payload = new TextEncoder().encode(JSON.stringify(message));
    await room.localParticipant.publishData(payload, { reliable: true });
  }

  private handleDataMessage(payload: Uint8Array): void {
    try {
      const message = JSON.parse(new TextDecoder().decode(payload)) as RoomStateMessage;
      if (message.type === 'ROOM_STATE' && message.settings) {
        this.applyRoomSettings(message.settings);
      }
    } catch {
      /* ignore malformed payloads */
    }
  }

  private refreshParticipants(): void {
    const room = this.room;
    if (!room) return;

    const views: ParticipantView[] = [];
    views.push(this.toParticipantView(room.localParticipant, true));

    for (const participant of room.remoteParticipants.values()) {
      views.push(this.toParticipantView(participant, false));
    }

    views.sort((a, b) => {
      if (a.isLocal) return -1;
      if (b.isLocal) return 1;
      return a.name.localeCompare(b.name);
    });

    this.participants.set(views);
  }

  private toParticipantView(participant: Participant, isLocal: boolean): ParticipantView {
    const role = this.parseRole(participant);
    const micPub = participant.getTrackPublication(Track.Source.Microphone);
    const camPub = participant.getTrackPublication(Track.Source.Camera);
    const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);

    return {
      identity: participant.identity,
      name: participant.name || participant.identity,
      role,
      isLocal,
      micEnabled: Boolean(micPub && !micPub.isMuted),
      camEnabled: Boolean(camPub && !camPub.isMuted),
      isScreenSharing: Boolean(screenPub && !screenPub.isMuted)
    };
  }

  private parseRole(participant: Participant): SessionRole {
    try {
      const meta = participant.metadata ? JSON.parse(participant.metadata) as { role?: SessionRole } : null;
      if (meta?.role) return meta.role;
    } catch {
      /* fallback */
    }
    return 'student';
  }

  private attachLocalVideo(participant: LocalParticipant): void {
    const el = this.localVideo()?.nativeElement;
    if (!el) return;

    el.innerHTML = '';
    for (const pub of participant.videoTrackPublications.values()) {
      if (pub.track && pub.source === Track.Source.Camera) {
        el.appendChild(pub.track.attach());
      }
    }
  }

  private attachRemoteTrack(pub: RemoteTrackPublication, participant: RemoteParticipant): void {
    if (!pub.track) return;

    if (pub.source === Track.Source.ScreenShare) {
      this.renderScreenShare(participant.identity, participant.name || participant.identity, pub.track);
      return;
    }

    if (pub.kind !== Track.Kind.Video || pub.source !== Track.Source.Camera) return;

    const container = this.remoteVideos()?.nativeElement;
    if (!container) return;

    this.removeRemoteTile(participant.identity);

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

  private renderScreenShare(identity: string, name: string, track: RemoteTrack): void {
    const stage = this.screenShareStage()?.nativeElement;
    if (!stage) return;

    stage.innerHTML = '';
    this.screenShareIdentity = identity;

    const wrapper = document.createElement('div');
    wrapper.className = 'screen-share-tile';

    const label = document.createElement('span');
    label.className = 'participant-name';
    label.textContent = `${name} — screen share`;

    wrapper.appendChild(track.attach());
    wrapper.appendChild(label);
    stage.appendChild(wrapper);
  }

  private clearScreenShare(identity: string | null): void {
    if (identity && this.screenShareIdentity !== identity) return;
    const stage = this.screenShareStage()?.nativeElement;
    if (stage) stage.innerHTML = '';
    this.screenShareIdentity = null;
  }

  private removeRemoteTile(identity: string): void {
    const container = this.remoteVideos()?.nativeElement;
    if (!container) return;
    const existing = container.querySelector(`[data-participant="${identity}"]`);
    existing?.remove();
  }

  private async formatInvokeError(error: unknown): Promise<string> {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (body && typeof body === 'object' && 'error' in body) {
          return String((body as { error: string }).error);
        }
      } catch {
        /* use fallback */
      }
    }
    return error instanceof Error ? error.message : 'Could not join session';
  }

  private async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }
}
