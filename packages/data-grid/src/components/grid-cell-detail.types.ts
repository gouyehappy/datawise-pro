export interface GridCellDetailLabels {
  /** Default modal title; may include `{column}`. */
  titleTemplate: string
  copy: string
  copied: string
  /** e.g. `{count} chars` */
  chars: string
  /** e.g. `{count} bytes` */
  bytes: string
  close: string
  nullValue: string
  apply: string
  formatJson: string
  invalidJson: string
  binaryHint: string
  binaryHex: string
  binaryImage: string
  binaryRaw: string
  /** e.g. `Image preview for {column}` */
  binaryImageAlt: string
}

/** English fallbacks when host does not pass `labels`. */
export const DEFAULT_GRID_CELL_DETAIL_LABELS: GridCellDetailLabels = {
  titleTemplate: '{column} · full value',
  copy: 'Copy',
  copied: 'Copied',
  chars: '{count} chars',
  bytes: '{count} bytes',
  close: 'Close',
  nullValue: 'NULL',
  apply: 'Apply to row',
  formatJson: 'Format JSON',
  invalidJson: 'Invalid JSON — fix syntax before applying',
  binaryHint: 'Binary values are preview-only. Edit via SQL or dedicated tools.',
  binaryHex: 'Hex',
  binaryImage: 'Image',
  binaryRaw: 'Raw',
  binaryImageAlt: 'Image preview for {column}',
}

export function formatGridCellDetailLabel(
  template: string,
  params: Record<string, string | number>,
): string {
  let text = template
  for (const [k, v] of Object.entries(params)) {
    text = text.split(`{${k}}`).join(String(v))
  }
  return text
}
