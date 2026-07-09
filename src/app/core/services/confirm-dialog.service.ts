import { Injectable, signal } from '@angular/core';

export type ConfirmDialogVariant = 'default' | 'danger';

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
}

interface ConfirmDialogState {
  visible: boolean;
  options: ConfirmDialogOptions | null;
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly _state = signal<ConfirmDialogState>({
    visible: false,
    options: null
  });

  private resolveFn: ((value: boolean) => void) | null = null;

  readonly state = this._state.asReadonly();

  confirm(options: ConfirmDialogOptions | string): Promise<boolean> {
    const opts: ConfirmDialogOptions =
      typeof options === 'string' ? { message: options } : options;

    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this._state.set({
        visible: true,
        options: {
          title: opts.title ?? 'Confirm',
          message: opts.message,
          confirmLabel: opts.confirmLabel ?? 'Confirm',
          cancelLabel: opts.cancelLabel ?? 'Cancel',
          variant: opts.variant ?? 'default'
        }
      });
    });
  }

  accept(): void {
    this.resolveFn?.(true);
    this.close();
  }

  dismiss(): void {
    this.resolveFn?.(false);
    this.close();
  }

  private close(): void {
    this.resolveFn = null;
    this._state.set({ visible: false, options: null });
  }
}
