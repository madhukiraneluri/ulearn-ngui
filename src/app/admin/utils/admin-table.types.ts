export interface AdminTableColumnDef {
  id: string;
  label: string;
  /** Shown by default in the table. Default true. */
  defaultVisible?: boolean;
  /** Include in export. Default true. Set false for action columns. */
  exportable?: boolean;
}

export function defaultVisibleColumnIds(columns: readonly AdminTableColumnDef[]): string[] {
  return columns
    .filter((c) => c.defaultVisible !== false)
    .map((c) => c.id);
}
