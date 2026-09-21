import { Injectable, inject, signal } from '@angular/core';
import { ExamService } from './exam.service';
import { ToastService } from '../../core/services/toast';

@Injectable({ providedIn: 'root' })
export class ExamProctoringService {
  private readonly examService = inject(ExamService);
  private readonly toast = inject(ToastService);

  private mediaStream: MediaStream | null = null;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private videoEl: HTMLVideoElement | null = null;

  readonly warningCount = signal(0);
  readonly mediaReady = signal(false);

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
    if (this.mediaStream) {
      video.srcObject = this.mediaStream;
      void video.play();
    }
  }

  async enterFullscreen(element: HTMLElement): Promise<void> {
    if (document.fullscreenElement) return;
    await element.requestFullscreen();
  }

  bindFullscreenWarnings(attemptId: string, onWarning?: (count: number) => void): () => void {
    const handler = async (): Promise<void> => {
      if (document.fullscreenElement) return;

      try {
        const count = await this.examService.incrementFullscreenExit(attemptId);
        this.warningCount.set(count);
        onWarning?.(count);
        this.toast.warning(`Fullscreen exited. Warning ${count} recorded.`);

        const shell = document.querySelector('.exam-attempt-shell') as HTMLElement | null;
        if (shell) {
          await this.enterFullscreen(shell);
        }
      } catch {
        this.toast.error('Could not record fullscreen warning.');
      }
    };

    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
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
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.videoEl = null;
    this.mediaReady.set(false);
  }
}
