const SQL_KEYWORDS = new Set([
    'inner', 'left', 'right', 'full', 'cross', 'join', 'on', 'where', 'group', 'order', 'by',
    'having', 'limit', 'union', 'select', 'from', 'as', 'and', 'or', 'using', 'natural',
])

function isAliasToken(token: string): boolean {
    const lower = token.toLowerCase()
    if (SQL_KEYWORDS.has(lower)) return false
    return /^[A-Za-z_][\w$]*$/.test(token)
}

/**
 * 表名补全位置之后是否已有别名（t1 / t2 / 自定义均可）
 * 兼容片段占位：FROM ord、FROM  ord、FROM orders ord
 * {@code replaceEndColumn} 与 Monaco range.endColumn / 光标列一致（1-based exclusive）。
 */
export function existingAliasAfterTableOnLine(line: string, replaceEndColumn: number): string | null {
    const rest = line.slice(replaceEndColumn).trimStart()
    if (!rest) return null

    const match = /^(?:AS\s+)?([A-Za-z_][\w$]*)\b/i.exec(rest)
    if (!match || !isAliasToken(match[1])) return null
    return match[1]
}

/** 替换范围之后是否已有 ON / WHERE / JOIN 等子句关键字（JOIN 片段常带 `ON $0`） */
export function hasClauseKeywordAfterReplace(line: string, replaceEndColumn: number): boolean {
    const rest = line.slice(replaceEndColumn).trimStart()
    if (!rest) return false
    return /^(?:ON|WHERE|GROUP|ORDER|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|JOIN|INNER|LEFT|RIGHT|FULL|CROSS|STRAIGHT_JOIN)\b/i.test(
        rest,
    )
}
