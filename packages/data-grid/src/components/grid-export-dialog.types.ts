export type GridExportFormat = 'csv' | 'json' | 'tsv' | 'sql' | 'xlsx'

export interface GridExportDialogLabels {
  title: string
  subtitle: string
  format: string
  truncatedWarning: string
  export: string
  exporting: string
  cancel: string
  maskTitle: string
  maskDescription: string
  /** May include `{project}`. */
  maskProdHint: string
  maskEnable: string
  maskColumns: string
  /** May include `{count}`. */
  maskSelectedCount: string
  formatCsv: string
  formatXlsx: string
  formatJson: string
  formatTsv: string
  formatSql: string
  templatePhone: string
  templateEmail: string
  templateIdCard: string
}

/** English fallbacks when host does not pass `labels`. */
export const DEFAULT_GRID_EXPORT_DIALOG_LABELS: GridExportDialogLabels = {
  title: 'Export results',
  subtitle: 'Choose a format. Files are saved by the host application.',
  format: 'Format',
  truncatedWarning:
    'This result reached the row limit and is incomplete. Text exports are marked INCOMPLETE; raise maxRows or narrow filters for a full result.',
  export: 'Export',
  exporting: 'Exporting…',
  cancel: 'Cancel',
  maskTitle: 'Masked export',
  maskDescription: 'Apply template rules to sensitive columns. Only the exported file is affected.',
  maskProdHint: 'This connection is production (project “{project}”). Masking is recommended before export.',
  maskEnable: 'Mask sensitive columns on export',
  maskColumns: 'Columns & templates',
  maskSelectedCount: '{count} column(s) selected',
  formatCsv: 'CSV (.csv)',
  formatXlsx: 'Excel report (.xlsx)',
  formatJson: 'JSON (.json)',
  formatTsv: 'TSV (.tsv)',
  formatSql: 'SQL INSERT (.sql)',
  templatePhone: 'Phone',
  templateEmail: 'Email',
  templateIdCard: 'ID card',
}

export function formatGridExportLabel(
  template: string,
  params: Record<string, string | number>,
): string {
  let text = template
  for (const [k, v] of Object.entries(params)) {
    text = text.split(`{${k}}`).join(String(v))
  }
  return text
}
