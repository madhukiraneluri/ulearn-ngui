import { Injectable, effect, inject } from '@angular/core';
import { AuthService } from './auth.service';

const IDLE_MS = 30 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 1000;

@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  private readonly auth = inject(AuthService);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityAt = 0;
  private listenersAttached = false;

  private readonly onActivity = (): void => {
    const now = Date.now();
    if (now - this.lastActivityAt < ACTIVITY_THROTTLE_MS) return;
    this.resetTimer();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - this.lastActivityAt >= IDLE_MS) {
      void this.auth.signOut('/auth/login?reason=timeout', 'timeout');
      return;
    }
    this.resetTimer();
  };

  constructor() {
    effect(() => {
      if (this.auth.isLoggedIn()) {
        this.start();
      } else {
        this.stop();
      }
    });
  }

  private start(): void {
    this.lastActivityAt = Date.now();
    this.attachListeners();
    this.resetTimer();
  }

  private stop(): void {
    this.detachListeners();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private attachListeners(): void {
    if (this.listenersAttached || typeof document === 'undefined') return;

    const events: (keyof DocumentEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click'
    ];

    for (const event of events) {
      document.addEventListener(event, this.onActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.listenersAttached = true;
  }

  private detachListeners(): void {
    if (!this.listenersAttached || typeof document === 'undefined') return;

    const events: (keyof DocumentEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click'
    ];

    for (const event of events) {
      document.removeEventListener(event, this.onActivity);
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.listenersAttached = false;
  }

  private resetTimer(): void {
    this.lastActivityAt = Date.now();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.auth.signOut('/auth/login?reason=timeout', 'timeout');
    }, IDLE_MS);
  }
}
