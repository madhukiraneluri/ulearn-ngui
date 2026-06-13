import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { AdminCourseService, AdminCourseInput } from './admin-course.service';
import {
  BULK_COURSE_COLUMNS,
  BulkImportRowResult,
  SAMPLE_COURSE_ROW,
  getBulkHeaders,
  rowToCourseInput
} from './course-bulk-import.util';

@Injectable({ providedIn: 'root' })
export class CourseBulkImportService {
  constructor(private readonly courseService: AdminCourseService) {}

  downloadSampleExcel(): void {
    const headers = getBulkHeaders();
    const sampleRow = headers.map((h) => {
      const val = SAMPLE_COURSE_ROW[h];
      return val === '' ? '' : val;
    });

    const sheetData = [headers, sampleRow];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws['!cols'] = headers.map((h) => ({
      wch: Math.max(h.length, String(SAMPLE_COURSE_ROW[h] ?? '').length + 2)
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Courses');

    const instructions = [
      ['ULearn — Bulk course import'],
      [''],
      ['1. Fill rows below the sample row (you may delete the sample row before upload).'],
      ['2. Only title is required; empty cells use defaults listed in the admin modal.'],
      ['3. slug must be unique. Duplicate slugs will fail for that row.'],
      [''],
      ...BULK_COURSE_COLUMNS.map((c) => [
        c.header,
        c.required ? 'REQUIRED' : 'optional',
        `Default: ${c.defaultValue}`,
        `Example: ${c.example}`
      ])
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions');

    XLSX.writeFile(wb, 'ulearn-courses-bulk-import-template.xlsx');
  }

  parseExcelFile(file: File): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName =
            workbook.SheetNames.find((n) => n.toLowerCase() === 'courses') ??
            workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: ''
          });
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  async importRows(rows: Record<string, unknown>[]): Promise<BulkImportRowResult[]> {
    const results: BulkImportRowResult[] = [];
    const nonEmptyRows = rows.filter((r) =>
      String(r['title'] ?? r['Title'] ?? '').trim()
    );

    if (nonEmptyRows.length === 0) {
      return [
        {
          rowNumber: 0,
          title: '—',
          success: false,
          message: 'No rows with a title found in the file.'
        }
      ];
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const titlePreview = String(row['title'] ?? row['Title'] ?? '').trim();
      if (!titlePreview) continue;

      const rowNumber = i + 2;
      const { input, error } = rowToCourseInput(row, rowNumber);

      if (error || !input) {
        results.push({
          rowNumber,
          title: titlePreview,
          success: false,
          message: error ?? 'Invalid row'
        });
        continue;
      }

      try {
        await this.courseService.create(input);
        results.push({
          rowNumber,
          title: input.title,
          success: true,
          message: `Created as /courses/${input.slug}`
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Create failed';
        results.push({
          rowNumber,
          title: input.title,
          success: false,
          message: msg
        });
      }
    }

    return results;
  }
}
