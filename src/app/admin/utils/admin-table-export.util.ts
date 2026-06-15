import * as XLSX from 'xlsx';
import { AdminTableColumnDef } from './admin-table.types';

export function downloadAdminTableXlsx<T>(
  rows: readonly T[],
  columns: readonly AdminTableColumnDef[],
  visibleColumnIds: readonly string[],
  filename: string,
  getCellValue: (row: T, columnId: string) => string
): void {
  const visible = columns.filter(
    (c) => visibleColumnIds.includes(c.id) && c.exportable !== false
  );
  if (visible.length === 0) return;

  const header = visible.map((c) => c.label);
  const data = rows.map((row) => visible.map((c) => getCellValue(row, c.id)));
  const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
