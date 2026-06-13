import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly _activeRequests = signal(0);

  readonly isLoading = computed(() => this._activeRequests() > 0);

  increment(): void {
    this._activeRequests.update(n => n + 1);
  }

  decrement(): void {
    this._activeRequests.update(n => Math.max(0, n - 1));
  }
}