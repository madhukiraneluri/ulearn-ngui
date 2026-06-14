import { Injectable, computed, signal } from '@angular/core';
import { LegalPolicyId } from '../../shared/constants/legal';

@Injectable({ providedIn: 'root' })
export class LegalModalService {
  private readonly _activePolicy = signal<LegalPolicyId | null>(null);

  readonly activePolicy = this._activePolicy.asReadonly();
  readonly isOpen = computed(() => this._activePolicy() !== null);

  open(policyId: LegalPolicyId): void {
    this._activePolicy.set(policyId);
    document.body.style.overflow = 'hidden';
  }

  close(): void {
    this._activePolicy.set(null);
    document.body.style.overflow = '';
  }
}
