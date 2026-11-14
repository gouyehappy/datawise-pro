/** T-ED-1: size gates for heavy SQL editor work (column diagnostics / statement frame). */

export const SQL_LARGE_DOC_CHARS = 200_000
export const SQL_LARGE_DOC_LINES = 5_000

export type SqlColumnDiagnosticsMode = 'auto' | 'on' | 'off'

export function isLargeSqlDocument(text: string, lineCount?: number): boolean {
    if (text.length >= SQL_LARGE_DOC_CHARS) {
        return true
    }
    if (typeof lineCount === 'number' && lineCount >= SQL_LARGE_DOC_LINES) {
        return true
    }
    // Cheap line estimate when Monaco line count is unavailable.
    if (lineCount === undefined) {
        let lines = 1
        for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 10) {
                lines++
                if (lines >= SQL_LARGE_DOC_LINES) {
                    return true
                }
            }
        }
    }
    return false
}

export function shouldRunLiveColumnDiagnostics(
    mode: SqlColumnDiagnosticsMode | undefined,
    text: string,
    lineCount?: number,
): boolean {
    const resolved: SqlColumnDiagnosticsMode = mode === 'on' || mode === 'off' ? mode : 'auto'
    if (resolved === 'off') {
        return false
    }
    if (resolved === 'on') {
        return true
    }
    return !isLargeSqlDocument(text, lineCount)
}

export function normalizeSqlColumnDiagnosticsMode(
    raw: unknown,
): SqlColumnDiagnosticsMode {
    if (raw === 'on' || raw === 'off' || raw === 'auto') {
        return raw
    }
    return 'auto'
}
