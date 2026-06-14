import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ULEARN_EMAILS,
  ULEARN_LINKTREE,
  ULEARN_PHONE_DISPLAY,
  ULEARN_PHONE_TEL,
  ULEARN_SOCIALS
} from '../../constants/contact.constants';

@Component({
  selector: 'app-contact-fab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './contact-fab.html',
  styleUrl: './contact-fab.scss'
})
export class ContactFab {
  readonly open = signal(false);
  readonly emails = ULEARN_EMAILS;
  readonly socials = ULEARN_SOCIALS;
  readonly phoneDisplay = ULEARN_PHONE_DISPLAY;
  readonly phoneTel = ULEARN_PHONE_TEL;
  readonly linktree = ULEARN_LINKTREE;

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
