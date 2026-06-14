import { LegalPolicyId, LegalDocument } from './legal.types';
import { TERMS_DOCUMENT } from './terms.content';
import { PRIVACY_DOCUMENT } from './privacy.content';
import { REFUND_DOCUMENT } from './refund.content';

export type { LegalPolicyId, LegalDocument, LegalSection } from './legal.types';

export const LEGAL_DOCUMENTS: Record<LegalPolicyId, LegalDocument> = {
  terms: TERMS_DOCUMENT,
  privacy: PRIVACY_DOCUMENT,
  refund: REFUND_DOCUMENT
};

export const LEGAL_ROUTES: Record<LegalPolicyId, string> = {
  terms: '/terms-of-use',
  privacy: '/privacy-policy',
  refund: '/refund-policy'
};
