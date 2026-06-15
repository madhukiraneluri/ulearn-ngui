import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminTableColumnDef } from '../../utils/admin-table.types';

@Component({
  selector: 'app-admin-table-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './admin-table-toolbar.html',
  styleUrl: './admin-table-toolbar.scss'
})
export class AdminTableToolbar {
  readonly columns = input.required<readonly AdminTableColumnDef[]>();
  readonly visibleColumnIds = input.required<readonly string[]>();
  readonly downloadLabel = input('Download');

  readonly visibleColumnIdsChange = output<string[]>();
  readonly download = output<void>();

  readonly pickerOpen = signal(false);

  isVisible(columnId: string): boolean {
    return this.visibleColumnIds().includes(columnId);
  }

  toggleColumn(columnId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = [...this.visibleColumnIds()];
    const next = checked
      ? current.includes(columnId)
        ? current
        : [...current, columnId]
      : current.filter((id) => id !== columnId);
    this.visibleColumnIdsChange.emit(next);
  }

  togglePicker(): void {
    this.pickerOpen.update((v) => !v);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
  }

  onDownload(): void {
    this.download.emit();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.column-picker-wrap')) {
      this.closePicker();
    }
  }
}
