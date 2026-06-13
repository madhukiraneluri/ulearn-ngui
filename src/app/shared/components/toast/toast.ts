import {
  Component, ChangeDetectionStrategy, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Toast, ToastService } from '../../../core/services/toast';

@Component({
  selector: 'app-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './toast.html',
  styleUrl: './toast.scss'
})
export class ToastComponent {
  readonly toastService = inject(ToastService);

  getIcon(type: Toast['type']): string {
    const map: Record<Toast['type'], string> = {
      success: '✓',
      error:   '✕',
      info:    'ℹ',
      warning: '⚠',
    };
    return map[type];
  }

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }
}