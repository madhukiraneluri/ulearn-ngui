export interface ExamRoleDefinition {
  slug: string;
  name: string;
  hasCoding: boolean;
  durationMinutes: number;
  mcqCount: number;
  codingCount: number;
  examTitle: string;
  /** Substrings matched against Excel "Role Interested In" (case-insensitive). */
  matchTerms: string[];
}

export const EXAM_ROLE_DEFINITIONS: readonly ExamRoleDefinition[] = [
  {
    slug: 'business-development-executive',
    name: 'Business Development Executive',
    hasCoding: false,
    durationMinutes: 60,
    mcqCount: 40,
    codingCount: 0,
    examTitle: 'Business Development Executive — Assessment',
    matchTerms: ['business development', 'bde', 'business development executive']
  },
  {
    slug: 'research-analyst',
    name: 'Research Analyst',
    hasCoding: true,
    durationMinutes: 90,
    mcqCount: 30,
    codingCount: 2,
    examTitle: 'Research Analyst — Assessment',
    matchTerms: ['research analyst', 'research']
  },
  {
    slug: 'associate-lead-generation-specialist',
    name: 'Associate Lead Generation Specialist',
    hasCoding: false,
    durationMinutes: 60,
    mcqCount: 40,
    codingCount: 0,
    examTitle: 'Associate Lead Generation Specialist — Assessment',
    matchTerms: ['lead generation', 'associate lead', 'lead gen']
  },
  {
    slug: 'relationship-executive',
    name: 'Relationship Executive',
    hasCoding: false,
    durationMinutes: 60,
    mcqCount: 40,
    codingCount: 0,
    examTitle: 'Relationship Executive — Assessment',
    matchTerms: ['relationship executive', 'relationship']
  },
  {
    slug: 'junior-full-stack-developer',
    name: 'Junior Full-Stack Developer',
    hasCoding: true,
    durationMinutes: 90,
    mcqCount: 30,
    codingCount: 2,
    examTitle: 'Junior Full-Stack Developer — Assessment',
    matchTerms: ['full stack', 'full-stack', 'fullstack', 'developer', 'junior full']
  }
] as const;

export function resolveRoleFromExcelText(raw: string): ExamRoleDefinition | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  for (const role of EXAM_ROLE_DEFINITIONS) {
    if (role.matchTerms.some((term) => text.includes(term))) {
      return role;
    }
    if (text.includes(role.slug.replace(/-/g, ' '))) {
      return role;
    }
    if (text === role.name.toLowerCase()) {
      return role;
    }
  }
  return null;
}

/** Tomorrow 10:00 AM IST as UTC ISO (used when seeding). */
export function recruitmentExamWindow(): { startsAt: string; endsAt: string } {
  const start = new Date('2026-09-22T04:30:00.000Z');
  const end = new Date('2026-09-22T14:30:00.000Z');
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}
