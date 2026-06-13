import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import { AdminEnrollmentsService } from './admin-enrollments.service';
import {
  BULK_ENROLL_EMAIL_HEADER,
  BULK_ENROLL_HELP,
  BulkEnrollRowResult,
  SAMPLE_ENROLL_EMAIL_ROW,
  parseEmailRows
} from './enrollment-bulk-import.util';

@Injectable({ providedIn: 'root' })
export class EnrollmentBulkImportService {
  private readonly enrollmentsService = inject(AdminEnrollmentsService);

  downloadSampleExcel(courseTitle?: string): void {
    const headers = [BULK_ENROLL_EMAIL_HEADER];
    const sampleRow = [SAMPLE_ENROLL_EMAIL_ROW.email];
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    ws['!cols'] = [{ wch: 36 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Emails');

    const instructions = [
      ['ULearn — Bulk enroll by email'],
      [''],
      [`Course: ${courseTitle ?? '(select course in admin)'}`],
      [''],
      ...BULK_ENROLL_HELP.map((line) => [line]),
      [''],
      ['Column', 'Required', 'Example'],
      ['email', 'Yes', SAMPLE_ENROLL_EMAIL_ROW.email]
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions');

    XLSX.writeFile(wb, 'ulearn-bulk-enroll-template.xlsx');
  }

  parseExcelFile(file: File): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName =
            workbook.SheetNames.find((n) => n.toLowerCase() === 'emails') ??
            workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          resolve(
            XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
          );
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  async importEmails(courseId: string, rows: Record<string, unknown>[]): Promise<BulkEnrollRowResult[]> {
    const { emails, error } = parseEmailRows(rows);
    if (error) {
      return [{ rowNumber: 0, email: '—', success: false, message: error }];
    }
    return this.enrollmentsService.bulkEnrollByEmail(courseId, emails);
  }
}
