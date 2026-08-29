import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { SessionRole } from '../../../models';

export interface LobbyJoinChoice {
  enableMic: boolean;
  enableCam: boolean;
}

@Component({
  selector: 'app-session-join-lobby',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './session-join-lobby.html',
  styleUrl: './session-join-lobby.scss'
})
export class SessionJoinLobby implements OnDestroy {
  readonly sessionTitle = input.required<string>();
  readonly role = input.required<SessionRole>();

  readonly joinSession = output<LobbyJoinChoice>();
  readonly joinWithoutDevices = output<void>();

  readonly previewVideo = viewChild<ElementRef<HTMLVideoElement>>('previewVideo');

  readonly micEnabled = signal(true);
  readonly camEnabled = signal(true);
  readonly micLevel = signal(0);
  readonly speakerTested = signal(false);
  readonly previewError = signal<string | null>(null);
  readonly isTestingSpeaker = signal(false);

  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelFrameId: number | null = null;
  private testOscillator: OscillatorNode | null = null;
  private testGain: GainNode | null = null;

  constructor() {
    void this.startPreview();
  }

  ngOnDestroy(): void {
    this.stopPreview();
    this.stopSpeakerTest();
  }

  roleLabel(): string {
    const r = this.role();
    return r.charAt(0).toUpperCase() + r.slice(1);
  }

  async toggleMic(): Promise<void> {
    const next = !this.micEnabled();
    this.micEnabled.set(next);
    this.mediaStream?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
  }

  async toggleCam(): Promise<void> {
    const next = !this.camEnabled();
    this.camEnabled.set(next);
    this.mediaStream?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
  }

  testSpeaker(): void {
    if (this.isTestingSpeaker()) {
      this.stopSpeakerTest();
      return;
    }

    this.isTestingSpeaker.set(true);
    this.audioContext ??= new AudioContext();
    const ctx = this.audioContext;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 440;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();

    this.testOscillator = oscillator;
    this.testGain = gain;
    this.speakerTested.set(true);

    window.setTimeout(() => this.stopSpeakerTest(), 1200);
  }

  onJoinSession(): void {
    this.joinSession.emit({
      enableMic: this.micEnabled(),
      enableCam: this.camEnabled()
    });
  }

  onJoinWithoutDevices(): void {
    this.joinWithoutDevices.emit();
  }

  private async startPreview(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.previewError.set('Camera and microphone are not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 } }
      });
      this.mediaStream = stream;

      const videoEl = this.previewVideo()?.nativeElement;
      if (videoEl) {
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => undefined);
      }

      this.startMicMeter(stream);
    } catch {
      this.previewError.set('Could not access camera or microphone. You can still join without devices.');
      this.camEnabled.set(false);
      this.micEnabled.set(false);
    }
  }

  private startMicMeter(stream: MediaStream): void {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    this.audioContext ??= new AudioContext();
    const ctx = this.audioContext;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    this.analyser = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = (): void => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(data);
      const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
      this.micLevel.set(Math.min(100, Math.round((avg / 128) * 100)));
      this.levelFrameId = requestAnimationFrame(tick);
    };
    tick();
  }

  private stopPreview(): void {
    if (this.levelFrameId != null) {
      cancelAnimationFrame(this.levelFrameId);
      this.levelFrameId = null;
    }

    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.analyser = null;

    const videoEl = this.previewVideo()?.nativeElement;
    if (videoEl) {
      videoEl.srcObject = null;
    }
  }

  private stopSpeakerTest(): void {
    this.testOscillator?.stop();
    this.testOscillator?.disconnect();
    this.testGain?.disconnect();
    this.testOscillator = null;
    this.testGain = null;
    this.isTestingSpeaker.set(false);
  }
}
