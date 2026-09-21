import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import {
  EXAM_ROLE_DEFINITIONS,
  resolveRoleFromExcelText
} from '../exam-portal/exam-role.config';

export interface ParsedExamRegistrationRow {
  email: string;
  fullName: string;
  roleInterested: string;
}

export interface NormalizedImportResult {
  rows: ParsedExamRegistrationRow[];
  multiRoleReassigned: number;
}

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

  /** Merge duplicate emails and assign one import row per distinct role exam. */
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
      const roleSlugs = new Set<string>();

      for (const row of group) {
        for (const slug of this.resolveRolesFromText(row.roleInterested)) {
          roleSlugs.add(slug);
        }
      }

      if (roleSlugs.size === 0) {
        normalized.push(primary);
        continue;
      }

      if (roleSlugs.size > 1 || group.length > 1) {
        multiRoleReassigned++;
      }

      const fullName = group.map((row) => row.fullName.trim()).find(Boolean) ?? primary.fullName;

      for (const slug of roleSlugs) {
        const roleDef = EXAM_ROLE_DEFINITIONS.find((role) => role.slug === slug);
        normalized.push({
          email: primary.email,
          fullName,
          roleInterested: roleDef?.name ?? slug
        });
      }
    }

    return { rows: normalized, multiRoleReassigned };
  }

  private resolveRolesFromText(roleInterested: string): string[] {
    const text = roleInterested.trim();
    if (!text) return [];

    if (/^multiple roles?$/i.test(text)) {
      return EXAM_ROLE_DEFINITIONS.map((role) => role.slug);
    }

    const parts = text
      .split(/[,;/|]+|\band\b|\&/i)
      .map((part) => part.trim())
      .filter(Boolean);

    const slugs = new Set<string>();
    for (const part of parts.length > 0 ? parts : [text]) {
      for (const role of EXAM_ROLE_DEFINITIONS) {
        const lower = part.toLowerCase();
        if (role.matchTerms.some((term) => lower.includes(term))) {
          slugs.add(role.slug);
        } else if (lower.includes(role.slug.replace(/-/g, ' '))) {
          slugs.add(role.slug);
        }
      }
    }

    if (slugs.size === 0) {
      const single = resolveRoleFromExcelText(text);
      if (single) slugs.add(single.slug);
    }

    return [...slugs];
  }
}
