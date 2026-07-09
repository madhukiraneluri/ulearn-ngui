import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import { AdminStudentsService } from './admin-students.service';
import {
  BULK_STUDENT_HEADERS,
  BULK_STUDENT_HELP,
  CreateStudentRowResult,
  CreateStudentsPayload,
  SAMPLE_STUDENT_ROW,
  parseStudentRows
} from './student-provision.util';

@Injectable({ providedIn: 'root' })
export class StudentBulkImportService {
  private readonly studentsService = inject(AdminStudentsService);

  downloadSampleExcel(): void {
    const headers = [...BULK_STUDENT_HEADERS];
    const sample = [
      SAMPLE_STUDENT_ROW.email,
      SAMPLE_STUDENT_ROW.full_name,
      SAMPLE_STUDENT_ROW.phone,
      SAMPLE_STUDENT_ROW.college
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    ws['!cols'] = [{ wch: 32 }, { wch: 24 }, { wch: 14 }, { wch: 36 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');

    const instructions = [
      ['ULearn — Bulk add students'],
      [''],
      ...BULK_STUDENT_HELP.map((line) => [line]),
      [''],
      ['Column', 'Required', 'Example'],
      ['email', 'Yes', SAMPLE_STUDENT_ROW.email],
      ['full_name', 'Yes', SAMPLE_STUDENT_ROW.full_name],
      ['phone', 'No', SAMPLE_STUDENT_ROW.phone],
      ['college', 'No', SAMPLE_STUDENT_ROW.college]
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions');

    XLSX.writeFile(wb, 'ulearn-bulk-add-students-template.xlsx');
  }

  parseExcelFile(file: File): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName =
            workbook.SheetNames.find((n) => n.toLowerCase() === 'students') ??
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

  async importStudents(
    rows: Record<string, unknown>[],
    options: Omit<CreateStudentsPayload, 'students'>
  ): Promise<CreateStudentRowResult[]> {
    const { students, error } = parseStudentRows(rows);
    if (error) {
      return [{ rowNumber: 0, email: '—', success: false, message: error }];
    }

    const payload: CreateStudentsPayload = {
      students: students.map(({ rowNumber: _r, ...s }) => s),
      ...options
    };

    const response = await this.studentsService.createStudents(payload);

    return response.results.map((result, index) => ({
      ...result,
      rowNumber: students[index]?.rowNumber ?? result.rowNumber
    }));
  }
}
