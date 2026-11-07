const SELECT_PREFIX = /^\s*(with\b|select\b)/i

export function isViewModelSelectSql(sql: string): boolean {
    const trimmed = sql.trim().replace(/;\s*$/, '')
    if (!trimmed) return false
    if (/^\s*explain\b/i.test(trimmed)) return false
    return SELECT_PREFIX.test(trimmed)
}

export function isSingleViewModelStatement(sql: string, statements: string[]): boolean {
    const meaningful = statements.map((item) => item.trim()).filter(Boolean)
    if (meaningful.length !== 1) return false
    return isViewModelSelectSql(meaningful[0] ?? '')
}
