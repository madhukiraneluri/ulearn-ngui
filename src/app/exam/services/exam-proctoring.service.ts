import { Injectable, inject, signal } from '@angular/core';
import { ExamService } from './exam.service';
import { ToastService } from '../../core/services/toast';

const FULLSCREEN_WARNING_DEBOUNCE_MS = 5000;

@Injectable({ providedIn: 'root' })
export class ExamProctoringService {
  private readonly examService = inject(ExamService);
  private readonly toast = inject(ToastService);

  private mediaStream: MediaStream | null = null;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private fullscreenPollTimer: ReturnType<typeof setInterval> | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private warningInFlight = false;
  private hasEnteredFullscreenOnce = false;
  private lastWarningAt = 0;

  readonly warningCount = signal(0);
  readonly mediaReady = signal(false);
  readonly fullscreenExited = signal(false);

  async requestMedia(): Promise<boolean> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true
      });
      this.mediaReady.set(true);
      return true;
    } catch {
      this.toast.error('Camera and microphone access is required for the exam.');
      this.mediaReady.set(false);
      return false;
    }
  }

  attachPreview(video: HTMLVideoElement): void {
    this.videoEl = video;
    if (!this.mediaStream) return;

    if (video.srcObject !== this.mediaStream) {
      video.srcObject = this.mediaStream;
    }

    void video.play().catch(() => {
      // Autoplay may require a user gesture in some browsers; preview still works after play().
    });
  }

  async enterFullscreen(element: HTMLElement): Promise<void> {
    if (document.fullscreenElement) return;
    try {
      await element.requestFullscreen();
      this.hasEnteredFullscreenOnce = true;
      this.fullscreenExited.set(false);
    } catch {
      // Browser may block until user gesture; polling will retry.
    }
  }

  bindFullscreenWarnings(attemptId: string, onWarning?: (count: number) => void): () => void {
    const recordExitWarning = async (): Promise<void> => {
      if (document.fullscreenElement || this.warningInFlight) return;
      if (!this.hasEnteredFullscreenOnce) return;

      const now = Date.now();
      if (now - this.lastWarningAt < FULLSCREEN_WARNING_DEBOUNCE_MS) return;

      this.warningInFlight = true;
      this.lastWarningAt = now;
      this.fullscreenExited.set(true);

      try {
        const count = await this.examService.incrementFullscreenExit(attemptId);
        this.warningCount.set(count);
        onWarning?.(count);
        this.toast.warning(`Fullscreen exited. Warning ${count} recorded. Return to fullscreen now.`);

        const shell = document.querySelector('.exam-attempt-shell') as HTMLElement | null;
        if (shell) {
          await this.enterFullscreen(shell);
        }
      } catch {
        this.toast.error('Could not record fullscreen warning.');
      } finally {
        this.warningInFlight = false;
      }
    };

    const onFullscreenChange = (): void => {
      if (document.fullscreenElement) {
        this.hasEnteredFullscreenOnce = true;
        this.fullscreenExited.set(false);
        return;
      }
      void recordExitWarning();
    };

    this.fullscreenPollTimer = setInterval(() => {
      if (document.fullscreenElement) {
        this.hasEnteredFullscreenOnce = true;
        this.fullscreenExited.set(false);
        return;
      }
      void recordExitWarning();
    }, FULLSCREEN_WARNING_DEBOUNCE_MS);

    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (this.fullscreenPollTimer) {
        clearInterval(this.fullscreenPollTimer);
        this.fullscreenPollTimer = null;
      }
    };
  }

  startSnapshotLoop(userId: string, attemptId: string, intervalMs = 60000): void {
    this.stopSnapshotLoop();
    void this.captureSnapshot(userId, attemptId);

    this.snapshotTimer = setInterval(() => {
      void this.captureSnapshot(userId, attemptId);
    }, intervalMs);
  }

  private async captureSnapshot(userId: string, attemptId: string): Promise<void> {
    if (!this.videoEl || this.videoEl.videoWidth === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = this.videoEl.videoWidth;
    canvas.height = this.videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(this.videoEl, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.75)
    );
    if (!blob) return;

    try {
      await this.examService.uploadProctoringSnapshot(userId, attemptId, blob);
    } catch {
      // Non-blocking — proctoring upload failures should not stop the exam
    }
  }

  stopSnapshotLoop(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  stopMedia(): void {
    this.stopSnapshotLoop();
    if (this.fullscreenPollTimer) {
      clearInterval(this.fullscreenPollTimer);
      this.fullscreenPollTimer = null;
    }
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.videoEl = null;
    this.mediaReady.set(false);
    this.fullscreenExited.set(false);
    this.hasEnteredFullscreenOnce = false;
  }
}
