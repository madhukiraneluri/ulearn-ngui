export interface BulkEnrollRowResult {
  rowNumber: number;
  email: string;
  success: boolean;
  message: string;
}

export const BULK_ENROLL_EMAIL_HEADER = 'email';

export const SAMPLE_ENROLL_EMAIL_ROW = {
  email: 'student@example.com'
};

export const BULK_ENROLL_HELP = [
  'One email per row in the email column.',
  'Only users with an existing ULearn account can be enrolled.',
  'Rows with unknown emails are listed as failed — no account found.',
  'Already enrolled users are skipped (marked as success).'
];

export function parseEmailRows(rows: Record<string, unknown>[]): {
  emails: Array<{ rowNumber: number; email: string }>;
  error?: string;
} {
  const emails: Array<{ rowNumber: number; email: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = String(rows[i]['email'] ?? rows[i]['Email'] ?? '').trim();
    if (!raw) continue;

    const normalized = raw.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return { emails: [], error: `Row ${i + 2}: invalid email "${raw}"` };
    }

    emails.push({ rowNumber: i + 2, email: normalized });
  }

  if (emails.length === 0) {
    return { emails: [], error: 'No email rows found. Add emails below the header row.' };
  }

  return { emails };
}
