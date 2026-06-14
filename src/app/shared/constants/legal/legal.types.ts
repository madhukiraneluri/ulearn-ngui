export interface LegalSection {
  title?: string;
  paragraphs?: string[];
  list?: string[];
}

export interface LegalDocument {
  title: string;
  lastUpdated?: string;
  sections: LegalSection[];
}

export type LegalPolicyId = 'terms' | 'privacy' | 'refund';
