import type {GridDisplayRow} from '../edit/useGridPendingEdit'

export function computePagedRows(
    rows: GridDisplayRow[],
    currentPage: number,
    pageSize: number,
): GridDisplayRow[] {
    const start = (currentPage - 1) * pageSize
    return rows.slice(start, start + pageSize)
}

export function computePagedRowIds(rows: GridDisplayRow[]): string[] {
    return rows.map((row) => row.id)
}

export function computeRowOffset(
    cursorTrimmedRows: number,
    currentPage: number,
    pageSize: number,
): number {
    return cursorTrimmedRows + (currentPage - 1) * pageSize
}

export function computeTotalPages(rowCount: number, pageSize: number): number {
    return Math.max(1, Math.ceil(rowCount / pageSize))
}

export function computeDisplayTotal(rowCount: number): string {
    return String(rowCount)
}

export function resolveFormViewRow(
    rows: GridDisplayRow[],
    selectedRowId: string | null,
): GridDisplayRow | null {
    if (selectedRowId) {
        const selected = rows.find((row) => row.id === selectedRowId)
        if (selected) return selected
    }
    return rows[0] ?? null
}

export function resolveFormViewRowIndex(
    rows: GridDisplayRow[],
    formViewRow: GridDisplayRow | null,
): number {
    if (!formViewRow) return -1
    return rows.findIndex((row) => row.id === formViewRow.id)
}

export function resolveFormViewRowNumber(index: number, cursorTrimmedRows: number): number {
    if (index < 0) return cursorTrimmedRows + 1
    return cursorTrimmedRows + index + 1
}

export function resolveFormViewRowTotal(rows: GridDisplayRow[], cursorTrimmedRows: number): number {
    return cursorTrimmedRows + rows.length
}

export function resolveFormViewCanPrev(index: number): boolean {
    return index > 0
}

export function resolveFormViewCanNext(index: number, rows: GridDisplayRow[]): boolean {
    return index >= 0 && index < rows.length - 1
}

export function resolveNextFormViewTarget(
    rows: GridDisplayRow[],
    currentIndex: number,
    delta: number,
    pageSize: number,
): {row: GridDisplayRow | null; page: number} {
    if (!rows.length) return {row: null, page: 1}
    const nextIndex = Math.max(0, Math.min(rows.length - 1, currentIndex + delta))
    const page = Math.floor(nextIndex / pageSize) + 1
    return {row: rows[nextIndex]!, page}
}

export function toggleLayoutMode(mode: 'grid' | 'form'): 'grid' | 'form' {
    return mode === 'grid' ? 'form' : 'grid'
}
