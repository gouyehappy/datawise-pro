/**
 * 将结果区条件/排序写回原 SQL（替换或追加子句）。
 * 纯函数，便于单测。
 */

const TRAILING_CLAUSE =
    /\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|FETCH\s+(?:FIRST|NEXT)|UNION|INTERSECT|EXCEPT)\b/i

function findClauseInsertPoint(sql: string): number {
    const match = TRAILING_CLAUSE.exec(sql)
    if (!match) {
        const trimmedEnd = sql.replace(/;?\s*$/, '')
        return trimmedEnd.length
    }
    return match.index
}

function stripTrailingSemicolon(sql: string): {body: string; semi: string} {
    const match = /;?\s*$/.exec(sql)
    const semi = match?.[0]?.includes(';') ? ';' : ''
    return {body: sql.slice(0, sql.length - (match?.[0]?.length ?? 0)), semi}
}

/** 把等值/IN 条件写回语句：已有 WHERE 则 AND，否则插入 WHERE */
export function applyWhereConditionToSql(sql: string, condition: string): string {
    const trimmedCondition = condition.trim()
    if (!trimmedCondition || !sql.trim()) return sql

    const {body, semi} = stripTrailingSemicolon(sql)
    if (/\bWHERE\b/i.test(body)) {
        const insertAt = findClauseInsertPoint(body)
        const before = body.slice(0, insertAt).replace(/\s+$/, '')
        const after = body.slice(insertAt)
        const gap = after.trim() ? '\n' : ''
        return `${before}\n  AND ${trimmedCondition}${gap}${after.trimStart()}${semi}`
    }

    const insertAt = findClauseInsertPoint(body)
    const before = body.slice(0, insertAt).replace(/\s+$/, '')
    const after = body.slice(insertAt)
    const gap = after.trim() ? '\n' : ''
    return `${before}\nWHERE ${trimmedCondition}${gap}${after.trimStart()}${semi}`
}

/** 写回 / 替换 ORDER BY（保留 LIMIT 等后续子句） */
export function applyOrderByToSql(
    sql: string,
    columnName: string,
    direction: 'asc' | 'desc' = 'asc',
): string {
    const quoted = `\`${columnName.replace(/`/g, '``')}\``
    const clause = `ORDER BY ${quoted}${direction === 'desc' ? ' DESC' : ''}`
    const {body, semi} = stripTrailingSemicolon(sql)
    const orderMatch = /\bORDER\s+BY\b[\s\S]*?(?=\b(?:LIMIT|OFFSET|FETCH\s+(?:FIRST|NEXT)|UNION|INTERSECT|EXCEPT)\b|$)/i.exec(
        body,
    )
    if (orderMatch && orderMatch.index != null) {
        const before = body.slice(0, orderMatch.index).replace(/\s+$/, '')
        const after = body.slice(orderMatch.index + orderMatch[0].length).replace(/^\s+/, '')
        const gap = after ? '\n' : ''
        return `${before}\n${clause}${gap}${after}${semi}`
    }
    const insertAt = findClauseInsertPoint(body)
    // 若插入点已是 LIMIT 等，ORDER BY 应插在其前
    const before = body.slice(0, insertAt).replace(/\s+$/, '')
    const after = body.slice(insertAt)
    const gap = after.trim() ? '\n' : ''
    return `${before}\n${clause}${gap}${after.trimStart()}${semi}`
}

/** 同一列连续点选时切换 ASC/DESC */
export function nextOrderDirection(
    previous: {column: string; direction: 'asc' | 'desc'} | null,
    column: string,
): 'asc' | 'desc' {
    if (previous && previous.column === column && previous.direction === 'asc') return 'desc'
    return 'asc'
}
