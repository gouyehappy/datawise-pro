import {
    isCursorInStringOrComment,
    maskNonCodeRegions,
    sqlScanModeAt,
} from '@sql-editor/completion/sql-scan'
import {
    resolveKnownTableRef,
    unquoteTableIdent,
} from '@sql-editor/utils/table-reference'

export {isCursorInStringOrComment, maskNonCodeRegions, sqlScanModeAt}
export type {SqlScanMode} from '@sql-editor/completion/sql-scan'

/** 去掉块注释、行注释与字符串字面量，便于解析表名 */
export function stripSqlForParsing(sql: string): string {
    return maskNonCodeRegions(sql)
}

export type StatementBounds = { start: number; end: number; text: string }

/** 光标所在语句在全文中的起止与原文 */
export function statementBoundsAtOffset(sql: string, offset: number): StatementBounds {
    const clamped = Math.max(0, Math.min(offset, sql.length))
    let start = 0
    let end = sql.length

    for (let i = 0; i < sql.length; i++) {
        if (sql[i] !== ';') continue
        if (sqlScanModeAt(sql, i) !== 'code') continue
        if (i < clamped) start = i + 1
        else {
            end = i
            break
        }
    }

    return {start, end, text: sql.slice(start, end)}
}

/** 光标所在语句的完整文本（含光标之后、同一句内） */
export function currentStatementAtOffset(sql: string, offset: number): string {
    const {text} = statementBoundsAtOffset(sql, offset)
    return stripSqlForParsing(text)
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 解析 FROM / JOIN 子句中的表与别名（仅当前作用域 SQL） */
export function parseTableAliases(sql: string, knownTables: string[] = []): Record<string, string> {
    const text = stripSqlForParsing(sql)
    const aliases: Record<string, string> = {}
    const reserved = new Set([
        'join', 'inner', 'left', 'right', 'full', 'cross', 'on', 'where', 'group', 'order', 'by',
        'having', 'limit', 'union', 'select', 'as', 'and', 'or', 'set', 'values', 'into',
    ])

    const pattern =
        /\b(?:FROM|(?:INNER|LEFT|RIGHT|FULL|CROSS)\s+JOIN|JOIN)\s+([`"'\[]?[\w$.]+[`"'\]]?)(?:\s+(?:AS\s+)?([`"'\[]?[\w$]+[`"'\]]?))?(?=\s|,|$)/gi

    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
        const tableRef = unquoteTableIdent(match[1])
        const table = resolveKnownTableRef(tableRef, knownTables) ?? tableRef
        const aliasRaw = match[2] ? unquoteTableIdent(match[2]) : null
        aliases[table.toLowerCase()] = table
        if (aliasRaw && !reserved.has(aliasRaw.toLowerCase())) {
            aliases[aliasRaw.toLowerCase()] = table
        }
    }

    return aliases
}

/**
 * 光标处可见的 CTE 别名：
 * - 主查询：WITH 块内已全部定义的 CTE
 * - CTE 体内：仅包含此前已定义完毕的 CTE，不含当前正在编写的 CTE
 */
export function parseCteAliasesVisibleAt(
    statementSql: string,
    offsetInStatement: number,
    maskedStatement?: string,
): Record<string, string> {
    const masked = maskedStatement ?? maskNonCodeRegions(statementSql)
    const withMatch = /^\s*WITH\s+/i.exec(masked)
    if (!withMatch) return {}

    const aliases: Record<string, string> = {}
    let pos = withMatch[0].length

    while (pos < masked.length) {
        while (pos < masked.length && /\s/.test(masked[pos])) pos++
        const rest = masked.slice(pos)
        const nameMatch = /^([`"'\[]?[\w$]+[`"'\]]?)\s+AS\s*\(/i.exec(rest)
        if (!nameMatch) break

        const cteName = unquoteTableIdent(nameMatch[1])
        const openParenPos = pos + nameMatch[0].length - 1

        let depth = 0
        let closePos = -1
        for (let i = openParenPos; i < masked.length; i++) {
            if (masked[i] === '(') depth++
            else if (masked[i] === ')') {
                depth--
                if (depth === 0) {
                    closePos = i
                    break
                }
            }
        }
        if (closePos < 0) break

        if (offsetInStatement > closePos) {
            aliases[cteName.toLowerCase()] = cteName
            pos = closePos + 1
            while (pos < masked.length && /\s/.test(masked[pos])) pos++
            if (masked[pos] === ',') {
                pos++
                continue
            }
            break
        }

        if (offsetInStatement > openParenPos && offsetInStatement <= closePos) {
            break
        }

        break
    }

    return aliases
}

/** All CTE names declared in a WITH list (definition + completed). */
export function parseCteNames(statementSql: string): Set<string> {
    const names = new Set<string>()
    const masked = maskNonCodeRegions(statementSql)
    const withMatch = /^\s*WITH\s+/i.exec(masked)
    if (!withMatch) return names

    let pos = withMatch[0].length
    while (pos < masked.length) {
        while (pos < masked.length && /\s/.test(masked[pos])) pos++
        const rest = masked.slice(pos)
        const nameMatch = /^([`"'\[]?[\w$]+[`"'\]]?)\s+AS\s*\(/i.exec(rest)
        if (!nameMatch) break

        names.add(unquoteTableIdent(nameMatch[1]).toLowerCase())
        const openParenPos = pos + nameMatch[0].length - 1
        let depth = 0
        let closePos = -1
        for (let i = openParenPos; i < masked.length; i++) {
            if (masked[i] === '(') depth++
            else if (masked[i] === ')') {
                depth--
                if (depth === 0) {
                    closePos = i
                    break
                }
            }
        }
        if (closePos < 0) break
        pos = closePos + 1
        while (pos < masked.length && /\s/.test(masked[pos])) pos++
        if (masked[pos] === ',') {
            pos++
            continue
        }
        break
    }
    return names
}

/** 在 SQL 文本中识别已出现的表名（含 FROM/JOIN 别名映射） */
export function findReferencedTables(sql: string, knownTables: string[]): string[] {
    if (!knownTables.length) return []

    const text = stripSqlForParsing(sql)
    if (!text.trim()) return []

    const canonical = new Map(knownTables.map((name) => [name.toLowerCase(), name]))
    const found = new Set<string>()

    for (const table of Object.values(parseTableAliases(text, knownTables))) {
        found.add(table)
    }

    const ordered = [...knownTables].sort((a, b) => b.length - a.length)
    for (const table of ordered) {
        const pattern = new RegExp(`\\b${escapeRegExp(table)}\\b`, 'i')
        if (pattern.test(text)) {
            found.add(canonical.get(table.toLowerCase()) ?? table)
        }
    }

    return [...found]
}
