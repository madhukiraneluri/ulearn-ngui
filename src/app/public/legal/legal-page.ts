import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LEGAL_DOCUMENTS, LegalDocument, LegalPolicyId } from '../../shared/constants/legal';

@Component({
  selector: 'app-legal-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal-page.html',
  styleUrl: './legal-page.scss'
})
export class LegalPage implements OnInit {
  private readonly route = inject(ActivatedRoute);

  readonly document = signal<LegalDocument | null>(null);

  ngOnInit(): void {
    const policyId = this.route.snapshot.data['policyId'] as LegalPolicyId;
    this.document.set(LEGAL_DOCUMENTS[policyId] ?? null);
  }
}
