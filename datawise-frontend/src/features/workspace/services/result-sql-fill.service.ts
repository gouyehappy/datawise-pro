import {
    buildOrderByClause,
    buildWhereEqualsClause,
} from '@/features/workspace/services/grid-cell-context.service'

/**
 * 根据当前语句是否已有 WHERE，决定插入 `\nWHERE …` 或 `\n  AND …`。
 * statementSql 一般为光标所在完整语句。
 */
export function buildWhereFillInsert(statementSql: string, columnName: string, value: unknown): string {
    const condition = buildWhereEqualsClause(columnName, value)
    const hasWhere = /\bWHERE\b/i.test(statementSql)
    if (hasWhere) return `\n  AND ${condition}`
    return `\nWHERE ${condition}`
}

/** 列头 ORDER BY：默认带前导换行，便于插在语句末尾 */
export function buildOrderByFillInsert(
    columnName: string,
    direction: 'asc' | 'desc' = 'asc',
): string {
    return `\n${buildOrderByClause(columnName, direction)}`
}

/** 插入 WHERE IN / 等值条件片段（含 WHERE 或 AND 前缀） */
export function buildWhereInFillInsert(statementSql: string, inClause: string): string {
    const trimmed = inClause.trim()
    if (!trimmed) return ''
    const hasWhere = /\bWHERE\b/i.test(statementSql)
    if (hasWhere) return `\n  AND ${trimmed}`
    return `\nWHERE ${trimmed}`
}
