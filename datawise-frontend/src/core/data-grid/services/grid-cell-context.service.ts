import type {TableColumn, TableRow} from '@/core/types'
import {formatCellFullValue, unwrapCellValue} from '@/core/utils/cell-value-format'
import {readRowCell} from '@/core/utils/query-result-column'

const WHERE_IN_MAX_VALUES = 50

function sqlLiteral(value: unknown): string {
    if (value == null) return 'NULL'
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    if (typeof value === 'boolean') return value ? '1' : '0'
    const text = formatCellFullValue(value)
    if (!text) return 'NULL'
    if (/^-?\d+(\.\d+)?$/.test(text.trim())) return text.trim()
    return `'${text.replace(/'/g, "''")}'`
}

function quoteColumn(columnName: string): string {
    return `\`${columnName.replace(/`/g, '``')}\``
}

/** 读取行在指定列上的原始值 */
export function readGridCellValue(row: TableRow | null | undefined, column: TableColumn): unknown {
    if (!row) return null
    return unwrapCellValue(readRowCell(row, column))
}

/** `column` = value 或 IS NULL */
export function buildWhereEqualsClause(columnName: string, value: unknown): string {
    const column = quoteColumn(columnName)
    if (value == null) return `${column} IS NULL`
    return `${column} = ${sqlLiteral(value)}`
}

/** `ORDER BY \`col\`` / `ORDER BY \`col\` DESC` */
export function buildOrderByClause(columnName: string, direction: 'asc' | 'desc' = 'asc'): string {
    const dir = direction === 'desc' ? ' DESC' : ''
    return `ORDER BY ${quoteColumn(columnName)}${dir}`
}

/** 从当前页行集生成 `column` IN (...)，去重且上限 50 个值 */
export function buildWhereInClause(
    columnName: string,
    rows: TableRow[],
    column: TableColumn,
): string | null {
    const seen = new Set<string>()
    const literals: string[] = []

    for (const row of rows) {
        const value = readGridCellValue(row, column)
        const key = value == null ? '\0null' : JSON.stringify(value)
        if (seen.has(key)) continue
        seen.add(key)
        literals.push(sqlLiteral(value))
        if (literals.length >= WHERE_IN_MAX_VALUES) break
    }

    if (!literals.length) return null
    const columnSql = quoteColumn(columnName)
    if (literals.length === 1) {
        const only = literals[0]
        return only === 'NULL' ? `${columnSql} IS NULL` : `${columnSql} = ${only}`
    }
    return `${columnSql} IN (${literals.join(', ')})`
}
