import type { CrtMentorDashboardRow } from '../../services/crt-mentor-dashboard.service';
import { csvCell } from '../../interview/usage/usage-csv';

export const MENTOR_DASHBOARD_CSV_HEADERS = [
  'Student name',
  'Email',
  'Batch',
  'Learning path',
  'Last attempt at',
  'Readiness score',
  'Status',
] as const;

export function mentorDashboardCsv(rows: readonly CrtMentorDashboardRow[]): string {
  const lines = [MENTOR_DASHBOARD_CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      MENTOR_DASHBOARD_CSV_HEADERS.map((header) =>
        csvCell(cellValue(row, header)),
      ).join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function cellValue(
  row: CrtMentorDashboardRow,
  header: (typeof MENTOR_DASHBOARD_CSV_HEADERS)[number],
): string | number | null {
  switch (header) {
    case 'Student name':
      return row.studentName;
    case 'Email':
      return row.email;
    case 'Batch':
      return row.batchName;
    case 'Learning path':
      return row.pathTitle;
    case 'Last attempt at':
      return row.lastAttemptAt;
    case 'Readiness score':
      return row.readinessScore;
    case 'Status':
      return row.status;
    default:
      return null;
  }
}
