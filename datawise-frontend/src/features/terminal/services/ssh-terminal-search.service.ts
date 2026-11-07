import type {Terminal} from '@xterm/xterm'

export interface TerminalSearchState {
    query: string
    row: number
    col: number
}

function lineText(terminal: Terminal, row: number): string {
    return terminal.buffer.active.getLine(row)?.translateToString(true) ?? ''
}

function findFrom(
    terminal: Terminal,
    query: string,
    startRow: number,
    startCol: number,
    direction: 'next' | 'prev',
): TerminalSearchState | null {
    const normalized = query.trim()
    if (!normalized) return null

    const buffer = terminal.buffer.active
    const totalRows = buffer.length
    if (totalRows <= 0) return null

    const lowerQuery = normalized.toLowerCase()

    if (direction === 'next') {
        for (let offset = 0; offset < totalRows; offset += 1) {
            const row = (startRow + offset) % totalRows
            const text = lineText(terminal, row)
            const fromCol = offset === 0 ? startCol : 0
            const index = text.toLowerCase().indexOf(lowerQuery, fromCol)
            if (index >= 0) {
                return {query: normalized, row, col: index}
            }
        }
        return null
    }

    for (let offset = 0; offset < totalRows; offset += 1) {
        const row = (startRow - offset + totalRows) % totalRows
        const text = lineText(terminal, row)
        const fromCol = offset === 0 ? startCol : text.length
        const slice = text.slice(0, fromCol)
        const index = slice.toLowerCase().lastIndexOf(lowerQuery)
        if (index >= 0) {
            return {query: normalized, row, col: index}
        }
    }
    return null
}

export function findInTerminal(
    terminal: Terminal | null,
    query: string,
    direction: 'next' | 'prev',
    current: TerminalSearchState | null,
): TerminalSearchState | null {
    if (!terminal) return null
    const normalized = query.trim()
    if (!normalized) return null

    const buffer = terminal.buffer.active
    const cursorRow = buffer.baseY + buffer.cursorY
    const cursorCol = buffer.cursorX

    const startRow = current?.query === normalized ? current.row : cursorRow
    const startCol = current?.query === normalized
        ? (direction === 'next' ? current.col + normalized.length : current.col - 1)
        : cursorCol

    const match = findFrom(
        terminal,
        normalized,
        startRow,
        Math.max(0, startCol),
        direction,
    ) ?? findFrom(
        terminal,
        normalized,
        direction === 'next' ? cursorRow : cursorRow,
        direction === 'next' ? 0 : lineText(terminal, cursorRow).length,
        direction,
    )

    if (!match) return null

    terminal.select(match.col, match.row, normalized.length)
    terminal.scrollToLine(Math.max(0, match.row - 2))
    return match
}

export function copyTerminalBuffer(terminal: Terminal | null, maxLines = 5000): string {
    if (!terminal) return ''
    const buffer = terminal.buffer.active
    const start = Math.max(0, buffer.length - maxLines)
    const lines: string[] = []
    for (let row = start; row < buffer.length; row += 1) {
        lines.push(lineText(terminal, row))
    }
    return lines.join('\n').trimEnd()
}
