import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject
} from '@angular/core';
import { LegalModalService } from '../../../core/services/legal-modal.service';
import { LEGAL_DOCUMENTS } from '../../constants/legal';

@Component({
  selector: 'app-legal-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal-modal.html',
  styleUrl: './legal-modal.scss'
})
export class LegalModal {
  private readonly legalModal = inject(LegalModalService);

  readonly isOpen = this.legalModal.isOpen;
  readonly document = computed(() => {
    const id = this.legalModal.activePolicy();
    return id ? LEGAL_DOCUMENTS[id] : null;
  });

  close(): void {
    this.legalModal.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) this.close();
  }
}
