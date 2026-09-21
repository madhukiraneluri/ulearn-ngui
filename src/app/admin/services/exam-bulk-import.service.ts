import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { EXAM_ROLE_DEFINITIONS } from '../exam-portal/exam-role.config';

export interface ParsedExamRegistrationRow {
  email: string;
  fullName: string;
  roleInterested: string;
}

export interface NormalizedImportResult {
  rows: ParsedExamRegistrationRow[];
  multiRoleReassigned: number;
}

const MULTI_ROLE_RESEARCH_ANALYST = 'Research Analyst';

@Injectable({ providedIn: 'root' })
export class ExamBulkImportService {
  downloadSampleExcel(): void {
    const headers = ['Email', 'Name', 'Role Interested In'];
    const sample = [
      ['jane@college.com', 'Jane Doe', 'Research Analyst'],
      ['john@college.com', 'John Smith', 'Junior Full-Stack Developer']
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
    ws['!cols'] = [{ wch: 32 }, { wch: 24 }, { wch: 36 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    XLSX.writeFile(wb, 'exam-candidates-template.xlsx');
  }

  parseExcelFile(file: File): Promise<ParsedExamRegistrationRow[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
          resolve(rows.map((row) => this.parseRow(row)).filter((r) => r.email || r.fullName));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  private parseRow(row: Record<string, unknown>): ParsedExamRegistrationRow {
    const entries = Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), String(v ?? '').trim()] as const);
    const find = (...keys: string[]) => {
      for (const key of keys) {
        const hit = entries.find(([k]) => k.includes(key));
        if (hit?.[1]) return hit[1];
      }
      return '';
    };

    return {
      email: find('email').toLowerCase(),
      fullName: find('name', 'full name', 'fullname'),
      roleInterested: find('role interested', 'role', 'roles interested')
    };
  }

  /** Collapse duplicate emails and multi-role applicants → Research Analyst only. */
  normalizeMultiRoleApplicants(rows: ParsedExamRegistrationRow[]): NormalizedImportResult {
    const byEmail = new Map<string, ParsedExamRegistrationRow[]>();

    for (const row of rows) {
      const email = row.email.trim().toLowerCase();
      if (!email) continue;
      const list = byEmail.get(email) ?? [];
      list.push({ ...row, email });
      byEmail.set(email, list);
    }

    const normalized: ParsedExamRegistrationRow[] = [];
    let multiRoleReassigned = 0;

    for (const group of byEmail.values()) {
      const primary = group[0];
      const multipleRows = group.length > 1;
      const multipleRolesInField = group.some((r) => this.roleFieldHasMultiple(r.roleInterested));
      const distinctRoles = new Set(
        group.map((r) => r.roleInterested.trim().toLowerCase()).filter(Boolean)
      );

      if (multipleRows || multipleRolesInField || distinctRoles.size > 1) {
        normalized.push({
          email: primary.email,
          fullName: primary.fullName,
          roleInterested: MULTI_ROLE_RESEARCH_ANALYST
        });
        multiRoleReassigned++;
      } else {
        normalized.push(primary);
      }
    }

    return { rows: normalized, multiRoleReassigned };
  }

  private roleFieldHasMultiple(roleInterested: string): boolean {
    const text = roleInterested.trim();
    if (!text) return false;
    if (/[,;/|]|\band\b|\&/i.test(text)) return true;

    let matchCount = 0;
    for (const role of EXAM_ROLE_DEFINITIONS) {
      const matched = role.matchTerms.some((term) => text.toLowerCase().includes(term));
      if (matched) matchCount++;
      if (matchCount > 1) return true;
    }
    return false;
  }
}
