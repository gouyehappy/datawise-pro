/**
 * TSV clipboard helpers for rectangular cell ranges (AG-community style DIY).
 */

export function cellsToTsv(matrix: string[][]): string {
  return matrix
      .map((row) =>
          row
              .map((cell) => {
                if (/[\t\n\r"]/.test(cell)) {
                  return `"${cell.replace(/"/g, '""')}"`
                }
                return cell
              })
              .join('\t'),
      )
      .join('\n')
}

export function tsvToMatrix(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) return []
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === '\t') {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += ch
  }
  row.push(cell)
  if (row.length > 1 || row[0] !== '' || rows.length === 0) {
    rows.push(row)
  }
  return rows
}

export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export async function readClipboardText(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}

export function useGridClipboard(options: {
  /** Build TSV matrix for current selection / focus. */
  getCopyMatrix: () => string[][]
  /** Apply pasted matrix starting at focus cell. */
  applyPasteMatrix?: (matrix: string[][]) => void
}) {
  async function copySelection(): Promise<boolean> {
    const matrix = options.getCopyMatrix()
    if (!matrix.length) return false
    return writeClipboardText(cellsToTsv(matrix))
  }

  async function pasteAtFocus(): Promise<boolean> {
    if (!options.applyPasteMatrix) return false
    const text = await readClipboardText()
    if (text == null) return false
    const matrix = tsvToMatrix(text)
    if (!matrix.length) return false
    options.applyPasteMatrix(matrix)
    return true
  }

  return {copySelection, pasteAtFocus, cellsToTsv, tsvToMatrix}
}
