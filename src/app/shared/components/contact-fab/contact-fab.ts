import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ULEARN_EMAILS,
  ULEARN_LINKTREE,
  ULEARN_PHONE_DISPLAY,
  ULEARN_PHONE_TEL,
  ULEARN_SOCIALS
} from '../../constants/contact.constants';

interface DragState {
  active: boolean;
  moved: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  originLeft: number;
  originTop: number;
}

@Component({
  selector: 'app-contact-fab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './contact-fab.html',
  styleUrl: './contact-fab.scss'
})
export class ContactFab {
  private readonly fabRoot = viewChild.required<ElementRef<HTMLElement>>('fabRoot');

  readonly open = signal(false);
  readonly position = signal<{ left: number; top: number } | null>(null);
  readonly isDragging = signal(false);
  readonly hasCustomPosition = signal(false);

  readonly emails = ULEARN_EMAILS;
  readonly socials = ULEARN_SOCIALS;
  readonly phoneDisplay = ULEARN_PHONE_DISPLAY;
  readonly phoneTel = ULEARN_PHONE_TEL;
  readonly linktree = ULEARN_LINKTREE;

  private drag: DragState = {
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originLeft: 0,
    originTop: 0
  };

  private suppressToggle = false;

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  onFabClick(event: Event): void {
    if (this.suppressToggle) {
      event.preventDefault();
      event.stopPropagation();
      this.suppressToggle = false;
      return;
    }
    this.toggle();
  }

  onDragStart(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('a, .panel-close')) return;

    const root = this.fabRoot().nativeElement;
    const rect = root.getBoundingClientRect();

    if (!this.position()) {
      this.position.set({ left: rect.left, top: rect.top });
      this.hasCustomPosition.set(true);
    }

    const pos = this.position()!;
    this.drag = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: pos.left,
      originTop: pos.top
    };

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  @HostListener('document:pointermove', ['$event'])
  onDragMove(event: PointerEvent): void {
    if (!this.drag.active || event.pointerId !== this.drag.pointerId) return;

    const dx = event.clientX - this.drag.startX;
    const dy = event.clientY - this.drag.startY;

    if (!this.drag.moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      this.drag.moved = true;
      this.isDragging.set(true);
    }

    if (!this.drag.moved) return;

    const root = this.fabRoot().nativeElement;
    const margin = 8;
    const left = Math.min(
      Math.max(this.drag.originLeft + dx, margin),
      window.innerWidth - root.offsetWidth - margin
    );
    const top = Math.min(
      Math.max(this.drag.originTop + dy, margin),
      window.innerHeight - root.offsetHeight - margin
    );

    this.position.set({ left, top });
  }

  @HostListener('document:pointerup', ['$event'])
  @HostListener('document:pointercancel', ['$event'])
  onDragEnd(event: PointerEvent): void {
    if (!this.drag.active || event.pointerId !== this.drag.pointerId) return;

    if (this.drag.moved) {
      this.suppressToggle = true;
    }

    this.drag.active = false;
    this.isDragging.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
