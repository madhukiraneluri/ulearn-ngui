import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  effect,
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
  VideoPresets,
  type LocalParticipant,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication
} from 'livekit-client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, invokeAuthedFunction } from '../../../core/supabase.client';
import { ToastService } from '../../../core/services/toast';
import { SessionRoomControlService } from '../../../shared/services/session-room-control.service';
import type { LiveSessionStatus, SessionRole, SessionRoomSettings } from '../../../models';
import { SessionWhiteboard } from '../session-whiteboard/session-whiteboard';
import { isWhiteboardSyncMessage, type WhiteboardSyncMessage } from '../session-whiteboard/whiteboard-sync.types';

interface LiveKitTokenResponse {
  token: string;
  wsUrl: string;
  roomName: string;
  role: SessionRole;
  sessionId: string;
  sessionStatus: LiveSessionStatus;
  roomSettings: SessionRoomSettings;
  error?: string;
}

interface RoomStateMessage {
  type: 'ROOM_STATE';
  settings: SessionRoomSettings;
}

interface ChatMessagePayload {
  type: 'CHAT';
  text: string;
  from: string;
}

interface SessionLiveMessage {
  type: 'SESSION_LIVE';
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

interface ChatMessage {
  id: string;
  from: string;
  text: string;
}

interface BoardTab {
  id: string;
  label: string;
}

interface SessionApplication {
  id: string;
  icon: string;
  title: string;
  description: string;
}

type SessionPhase = 'connecting' | 'waiting' | 'prelive' | 'live' | 'error';

@Component({
  selector: 'app-session-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SessionWhiteboard],
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

  readonly applications: SessionApplication[] = [
    { id: 'board', icon: 'B', title: 'Board', description: 'Open a new board' },
    { id: 'drive', icon: 'D', title: 'Drive', description: 'Share ppt, pdf, doc, audio or video files' },
    { id: 'screen', icon: 'S', title: 'Screen', description: 'Share your screen' },
    { id: 'camera', icon: 'C', title: 'Second camera', description: 'Share a second camera as content' },
    { id: 'youtube', icon: 'Y', title: 'YouTube', description: 'Play a YouTube video synchronously' },
    { id: 'docs', icon: 'G', title: 'Google Docs', description: 'Collaborate with Google Docs' },
    { id: 'quiz', icon: 'Q', title: 'Quiz', description: 'Share polls, questions, and quizzes' },
    { id: 'images', icon: 'I', title: 'Image library', description: 'Share images from the library' },
    { id: 'courses', icon: 'E', title: 'Courses', description: 'Bring course content to the board' }
  ];

  readonly sessionPhase = signal<SessionPhase>('connecting');
  readonly isConnecting = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly role = signal<SessionRole>('student');
  readonly sessionId = signal('');
  readonly sessionStatus = signal<LiveSessionStatus>('scheduled');
  readonly sessionLive = signal(false);
  readonly showGoLiveModal = signal(true);
  readonly roomName = signal('');
  readonly micEnabled = signal(false);
  readonly camEnabled = signal(false);
  readonly screenShareEnabled = signal(false);
  readonly roomSettings = signal<SessionRoomSettings>({
    allowStudentMic: true,
    allowStudentCamera: true,
    allowStudentUnmute: true,
    isolateStudents: false
  });
  readonly participants = signal<ParticipantView[]>([]);
  readonly controlBusy = signal(false);
  readonly chatMessages = signal<ChatMessage[]>([]);
  readonly chatDraft = signal('');
  readonly showAppsPanel = signal(false);
  readonly showSettingsPanel = signal(false);
  readonly activeRailPanel = signal<'chat' | 'participants' | 'apps' | 'settings' | 'none'>('none');
  readonly boardTabs = signal<BoardTab[]>([{ id: 'board-1', label: 'Board-1' }]);
  readonly activeBoardId = signal('board-1');
  readonly participantId = signal('');
  readonly lastWhiteboardSync = signal<WhiteboardSyncMessage | null>(null);

  private room: Room | null = null;
  private screenShareIdentity: string | null = null;
  private statusPollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      if (this.sessionLive() && this.camEnabled()) {
        this.scheduleAttachLocalVideo();
      }
    });
  }

  ngOnInit(): void {
    void this.bootstrap();
  }

  ngOnDestroy(): void {
    this.stopStatusPoll();
    void this.disconnect();
  }

  isInstructorOrModerator(): boolean {
    const r = this.role();
    return r === 'instructor' || r === 'moderator';
  }

  dismissGoLiveModal(): void {
    this.showGoLiveModal.set(false);
  }

  toggleAppsPanel(): void {
    this.toggleRailPanel('apps');
  }

  toggleSettingsPanel(): void {
    if (!this.isInstructorOrModerator()) return;
    this.toggleRailPanel('settings');
  }

  toggleRailPanel(panel: 'chat' | 'participants' | 'apps' | 'settings'): void {
    this.activeRailPanel.update((current) => (current === panel ? 'none' : panel));
    this.showAppsPanel.set(panel === 'apps' && this.activeRailPanel() === 'apps');
    this.showSettingsPanel.set(panel === 'settings' && this.activeRailPanel() === 'settings');
  }

  closeRailPanels(): void {
    this.activeRailPanel.set('none');
    this.showAppsPanel.set(false);
    this.showSettingsPanel.set(false);
  }

  toggleFullscreen(): void {
    this.enterFullscreen();
  }

  isRailPanelOpen(panel: 'chat' | 'participants' | 'apps' | 'settings'): boolean {
    return this.activeRailPanel() === panel;
  }

  showChatDock(): boolean {
    return !this.sessionLive() || this.activeRailPanel() === 'chat';
  }

  closePanels(): void {
    this.closeRailPanels();
  }

  selectBoard(boardId: string): void {
    this.activeBoardId.set(boardId);
    this.lastWhiteboardSync.set(null);
  }

  canDrawOnBoard(): boolean {
    return this.sessionLive();
  }

  onWhiteboardSync(message: WhiteboardSyncMessage): void {
    const room = this.room;
    if (!room || !this.sessionLive()) return;

    const destinationIdentities = Array.from(room.remoteParticipants.values()).map(
      (participant) => participant.identity
    );

    if (destinationIdentities.length === 0) {
      return;
    }

    void room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), {
      reliable: message.type !== 'EX_SCENE',
      destinationIdentities
    });
  }

  runApplication(appId: string): void {
    switch (appId) {
      case 'board':
        this.addBoard();
        break;
      case 'screen':
        void this.toggleScreenShare();
        this.closePanels();
        break;
      default:
        this.toast.info('This application will be available soon');
        this.closePanels();
        break;
    }
  }

  addBoard(): void {
    const nextIndex = this.boardTabs().length + 1;
    const id = `board-${nextIndex}`;
    this.boardTabs.update((tabs) => [...tabs, { id, label: `Board-${nextIndex}` }]);
    this.activeBoardId.set(id);
    this.closePanels();
  }

  async startWithAudio(): Promise<void> {
    await this.makeSessionLive(false, true);
  }

  async startWithVideo(): Promise<void> {
    await this.makeSessionLive(true, true);
  }

  async makeSessionLive(enableCam = true, enableMic = true): Promise<void> {
    if (!this.isInstructorOrModerator() || this.controlBusy()) return;

    this.controlBusy.set(true);
    try {
      const result = await this.roomControl.startSession(this.sessionId());
      if (!result.ok) {
        this.toast.error(result.error ?? 'Could not start session');
        return;
      }

      this.sessionStatus.set('live');
      this.sessionLive.set(true);
      this.sessionPhase.set('live');
      this.showGoLiveModal.set(false);

      await this.publishLocalTracks(enableMic, enableCam);
      await this.broadcastSessionLive();
      this.enterFullscreen();
      this.toast.success('Session is now live');
    } finally {
      this.controlBusy.set(false);
    }
  }

  async toggleMic(): Promise<void> {
    const room = this.room;
    if (!room || !this.sessionLive()) return;

    const next = !this.micEnabled();
    if (next && !this.canControlMic()) {
      this.toast.error('The instructor has disabled unmuting');
      return;
    }

    await room.localParticipant.setMicrophoneEnabled(next);
    this.micEnabled.set(next);
    this.refreshParticipants();
    this.scheduleAttachLocalVideo();
  }

  async toggleCam(): Promise<void> {
    const room = this.room;
    if (!room || !this.sessionLive()) return;

    const next = !this.camEnabled();
    if (next && !this.canControlCam()) {
      this.toast.error('The instructor has disabled camera');
      return;
    }

    try {
      if (next) {
        await room.localParticipant.setCameraEnabled(true, {
          facingMode: 'user',
          resolution: VideoPresets.h720.resolution
        });
      } else {
        await room.localParticipant.setCameraEnabled(false);
      }
    } catch {
      this.toast.error('Could not access camera');
      return;
    }
    this.camEnabled.set(next);
    this.scheduleAttachLocalVideo();
    this.refreshParticipants();
  }

  async toggleScreenShare(): Promise<void> {
    const room = this.room;
    if (!room || !this.isInstructorOrModerator() || !this.sessionLive()) return;

    const next = !this.screenShareEnabled();
    await room.localParticipant.setScreenShareEnabled(next);
    this.screenShareEnabled.set(next);
    this.refreshParticipants();
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

  async muteAll(): Promise<void> {
    if (!this.isInstructorOrModerator()) return;
    await this.runControl(() => this.roomControl.muteAll(this.sessionId()));
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

  async toggleAllowUnmute(): Promise<void> {
    if (!this.isInstructorOrModerator()) return;
    const current = this.roomSettings();
    if (current.allowStudentUnmute) {
      await this.runControl(() => this.roomControl.disallowUnmute(this.sessionId()));
    } else {
      await this.runControl(() => this.roomControl.allowUnmute(this.sessionId()));
    }
  }

  async toggleIsolateStudents(): Promise<void> {
    if (!this.isInstructorOrModerator()) return;
    const current = this.roomSettings();
    await this.runControl(() =>
      this.roomControl.updateSettings(this.sessionId(), {
        isolateStudents: !current.isolateStudents
      })
    );
  }

  async muteParticipant(identity: string): Promise<void> {
    if (!this.isInstructorOrModerator() || identity === this.room?.localParticipant.identity) return;
    await this.runControl(() => this.roomControl.muteParticipant(this.sessionId(), identity));
  }

  sendChat(event: Event): void {
    event.preventDefault();
    const room = this.room;
    const text = this.chatDraft().trim();
    if (!room || !text || !this.sessionLive()) return;

    const from = room.localParticipant.name || 'You';
    const payload: ChatMessagePayload = { type: 'CHAT', text, from };
    void room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(payload)), {
      reliable: true
    });

    this.chatMessages.update((list) => [
      ...list,
      { id: crypto.randomUUID(), from, text }
    ]);
    this.chatDraft.set('');
  }

  onLeave(): void {
    void this.disconnect().then(() => this.leaveSession.emit());
  }

  private async bootstrap(): Promise<void> {
    const meta = await this.loadInviteMeta();
    if (!meta) {
      this.errorMessage.set('Invalid session link');
      this.sessionPhase.set('error');
      return;
    }

    this.role.set(meta.role);
    this.sessionId.set(meta.sessionId);
    this.sessionStatus.set(meta.status);

    if (meta.role !== 'instructor' && meta.status === 'scheduled') {
      this.sessionPhase.set('waiting');
      this.isConnecting.set(false);
      this.startStatusPoll();
      return;
    }

    await this.connect();
  }

  private async loadInviteMeta(): Promise<{
    role: SessionRole;
    sessionId: string;
    status: LiveSessionStatus;
  } | null> {
    const { data, error } = await supabase
      .from('session_invites')
      .select('role, live_sessions(id, status)')
      .eq('token', this.inviteToken())
      .maybeSingle();

    if (error || !data) return null;

    const sessionRaw = data.live_sessions;
    const session = (Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw) as {
      id?: string;
      status?: LiveSessionStatus;
    } | null;

    if (!session?.id || !session.status) return null;

    return {
      role: data.role as SessionRole,
      sessionId: session.id,
      status: session.status
    };
  }

  private startStatusPoll(): void {
    this.stopStatusPoll();
    this.statusPollTimer = setInterval(() => {
      void this.checkSessionStarted();
    }, 4000);
    void this.checkSessionStarted();
  }

  private stopStatusPoll(): void {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
  }

  private async checkSessionStarted(): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId) return;

    const { data } = await supabase
      .from('live_sessions')
      .select('status')
      .eq('id', sessionId)
      .maybeSingle();

    if (data?.status === 'live') {
      this.stopStatusPoll();
      this.sessionStatus.set('live');
      await this.connect();
    } else if (data?.status === 'ended' || data?.status === 'cancelled') {
      this.stopStatusPoll();
      this.errorMessage.set('This session is no longer available');
      this.sessionPhase.set('error');
    }
  }

  private async connect(): Promise<void> {
    this.isConnecting.set(true);
    this.errorMessage.set(null);
    this.sessionPhase.set('connecting');

    try {
      const { data, error } = await invokeAuthedFunction<LiveKitTokenResponse>('livekit-token', {
        inviteToken: this.inviteToken()
      });

      if (error) {
        const msg = await this.formatInvokeError(error);
        if (msg.toLowerCase().includes('not started')) {
          this.sessionPhase.set('waiting');
          this.startStatusPoll();
          return;
        }
        throw new Error(msg);
      }

      if (!data?.token || !data.wsUrl) {
        throw new Error(data?.error ?? 'Could not get session token');
      }

      this.role.set(data.role);
      this.sessionId.set(data.sessionId);
      this.roomName.set(data.roomName);
      this.sessionStatus.set(data.sessionStatus);
      this.roomSettings.set(data.roomSettings);

      const isLive = data.sessionStatus === 'live';
      this.sessionLive.set(isLive);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          facingMode: 'user',
          resolution: VideoPresets.h720.resolution
        },
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      this.room = room;
      this.wireRoomEvents(room);

      await room.connect(data.wsUrl, data.token);
      this.participantId.set(room.localParticipant.identity);

      if (this.isInstructorOrModerator() && !isLive) {
        this.sessionPhase.set('prelive');
        this.showGoLiveModal.set(true);
      } else if (isLive) {
        this.sessionPhase.set('live');
        this.enterFullscreen();
        const mic = this.initialMic() && this.canPublishMic(data.role, data.roomSettings);
        const cam = this.initialCam() && this.canPublishCam(data.role, data.roomSettings);
        await this.publishLocalTracks(mic, cam);
      }

      this.refreshParticipants();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not join session';
      this.errorMessage.set(msg);
      this.sessionPhase.set('error');
      this.toast.error(msg);
    } finally {
      this.isConnecting.set(false);
    }
  }

  private wireRoomEvents(room: Room): void {
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
        this.scheduleAttachLocalVideo();
        this.refreshParticipants();
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
        if (pub.source === Track.Source.ScreenShare) {
          this.clearScreenShare(room.localParticipant.identity);
        }
        if (pub.source === Track.Source.Camera) {
          this.scheduleAttachLocalVideo();
        }
        this.refreshParticipants();
      })
      .on(RoomEvent.ParticipantConnected, () => this.refreshParticipants())
      .on(RoomEvent.ParticipantDisconnected, () => this.refreshParticipants())
      .on(RoomEvent.TrackMuted, () => this.refreshParticipants())
      .on(RoomEvent.TrackUnmuted, () => this.refreshParticipants())
      .on(RoomEvent.DataReceived, (payload) => this.handleDataMessage(payload))
      .on(RoomEvent.Disconnected, () => {
        this.sessionLive.set(false);
      });
  }

  private async publishLocalTracks(mic: boolean, cam: boolean): Promise<void> {
    const room = this.room;
    if (!room) return;

    try {
      await room.localParticipant.setMicrophoneEnabled(mic);
    } catch {
      this.toast.error('Could not access microphone');
      mic = false;
    }

    try {
      if (cam) {
        await room.localParticipant.setCameraEnabled(true, {
          facingMode: 'user',
          resolution: VideoPresets.h720.resolution
        });
      } else {
        await room.localParticipant.setCameraEnabled(false);
      }
    } catch {
      this.toast.error('Could not access camera. Check browser permissions and close other apps using it.');
      cam = false;
      await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
    }

    this.micEnabled.set(mic);
    this.camEnabled.set(cam);
    this.scheduleAttachLocalVideo();
  }

  private scheduleAttachLocalVideo(): void {
    const attempt = (retries = 0): void => {
      const host = this.localVideo()?.nativeElement;
      if (host || retries >= 30) {
        this.attachLocalVideo(this.room?.localParticipant);
        return;
      }
      requestAnimationFrame(() => attempt(retries + 1));
    };
    queueMicrotask(() => attempt());
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
      this.scheduleAttachLocalVideo();
    }
  }

  private async broadcastRoomState(settings: SessionRoomSettings): Promise<void> {
    const room = this.room;
    if (!room || !this.isInstructorOrModerator()) return;

    const message: RoomStateMessage = { type: 'ROOM_STATE', settings };
    const payload = new TextEncoder().encode(JSON.stringify(message));
    await room.localParticipant.publishData(payload, { reliable: true });
  }

  private async broadcastSessionLive(): Promise<void> {
    const room = this.room;
    if (!room || !this.isInstructorOrModerator()) return;

    const message: SessionLiveMessage = { type: 'SESSION_LIVE' };
    await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), {
      reliable: true
    });
  }

  private handleDataMessage(payload: Uint8Array): void {
    try {
      const message = JSON.parse(new TextDecoder().decode(payload)) as unknown;

      if (isWhiteboardSyncMessage(message)) {
        const localIdentity = this.room?.localParticipant.identity.trim();
        const senderId = message.senderId.trim();
        if (localIdentity && senderId === localIdentity) return;
        if (!message.syncId) return;
        this.lastWhiteboardSync.set(message);
        return;
      }

      const typed = message as RoomStateMessage | ChatMessagePayload | SessionLiveMessage;

      if (typed.type === 'ROOM_STATE' && 'settings' in typed && typed.settings) {
        this.applyRoomSettings(typed.settings);
      } else if (typed.type === 'CHAT' && 'text' in typed) {
        this.chatMessages.update((list) => [
          ...list,
          { id: crypto.randomUUID(), from: typed.from, text: typed.text }
        ]);
      } else if (typed.type === 'SESSION_LIVE') {
        this.sessionLive.set(true);
        this.sessionPhase.set('live');
        this.enterFullscreen();
        if (!this.isInstructorOrModerator() && this.room) {
          void this.publishLocalTracks(this.initialMic(), this.initialCam());
        }
      }
    } catch {
      /* ignore malformed payloads */
    }
  }

  private refreshParticipants(): void {
    const room = this.room;
    if (!room) return;

    const views: ParticipantView[] = [this.toParticipantView(room.localParticipant, true)];

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

  private shouldSubscribeToParticipant(participant: RemoteParticipant): boolean {
    if (!this.roomSettings().isolateStudents) return true;
    if (this.isInstructorOrModerator()) return true;

    const remoteRole = this.parseRole(participant);
    return remoteRole === 'instructor' || remoteRole === 'moderator';
  }

  private attachLocalVideo(participant: LocalParticipant | undefined): void {
    if (!participant) return;

    const host = this.localVideo()?.nativeElement;
    if (!host) return;

    host.innerHTML = '';

    const camPub = participant.getTrackPublication(Track.Source.Camera);
    if (!camPub?.track || camPub.isMuted || !this.camEnabled()) {
      return;
    }

    const videoEl = camPub.track.attach() as HTMLVideoElement;
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    videoEl.muted = true;
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    videoEl.style.objectFit = 'cover';
    videoEl.style.transform = 'scaleX(-1)';
    void videoEl.play().catch(() => undefined);
    host.appendChild(videoEl);
  }

  private attachRemoteTrack(pub: RemoteTrackPublication, participant: RemoteParticipant): void {
    if (!pub.track || !this.shouldSubscribeToParticipant(participant)) return;

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
    container.querySelector(`[data-participant="${identity}"]`)?.remove();
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

  private enterFullscreen(): void {
    const root = document.documentElement;
    if (typeof root.requestFullscreen === 'function') {
      void root.requestFullscreen().catch(() => undefined);
    }
  }

  private async disconnect(): Promise<void> {
    this.stopStatusPoll();
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }
}
