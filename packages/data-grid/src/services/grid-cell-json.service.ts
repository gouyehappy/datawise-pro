export type GridCellEditorKind = 'text' | 'longText' | 'json' | 'binary'

export function formatJsonEditorText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const parsed = JSON.parse(trimmed) as unknown
  return JSON.stringify(parsed, null, 2)
}

/** Returns an error key (`invalidJson`) or null when valid / empty. */
export function validateJsonEditorText(raw: string): 'invalidJson' | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    JSON.parse(trimmed)
    return null
  } catch {
    return 'invalidJson'
  }
}
