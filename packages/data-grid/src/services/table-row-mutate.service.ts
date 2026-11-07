/**
 * 表行增删改：草稿解析、主键提取、INSERT 默认值处理。
 *
 * 新增行草稿规则：
 * - 自增列：预填 INFORMATION_SCHEMA.AUTO_INCREMENT（或 max+1）
 * - SQL 表达式默认值（CURRENT_TIMESTAMP 等）：留空，提交时省略该列由库生成
 * - 普通字面量默认值（如 0、'guest'）：原样预填
 */
import type {TableColumn, TableColumnDetail, TableRow} from '../grid-types'
import {columnRowKey, readRowCell, readRowCellScalar} from '../utils/query-result-column'

export function resolvePrimaryKeyColumns(columns: TableColumnDetail[]): string[] {
    return columns
        .filter((col) => isPrimaryKeyType(col.keyType))
        .map((col) => col.name)
}

/** Align with grid header / backend introspection (PRI, PRIMARY, PK). */
export function isPrimaryKeyType(keyType?: string | null): boolean {
    const normalized = keyType?.trim().toUpperCase() ?? ''
    return normalized === 'PRI' || normalized === 'PK' || normalized === 'PRIMARY' || normalized.startsWith('PRIMARY')
}

export function buildRowMutateValues(
    row: TableRow,
    columns: TableColumn[],
): Record<string, string | number | boolean | null> {
    const values: Record<string, string | number | boolean | null> = {}
    for (const col of columns) {
        values[col.name] = readRowCellScalar(row, col)
    }
    return values
}

/** 数据库元数据里的 DEFAULT 可能是 SQL 表达式，不能当普通字符串填进输入框 */
export function isSqlExpressionDefault(
    defaultValue?: string | null,
    extra?: string | null,
): boolean {
    if (!defaultValue?.trim()) return false
    const normalized = defaultValue.trim().toLowerCase()
    if (normalized.includes('current_timestamp')) return true
    if (normalized === 'now()' || normalized.startsWith('now(')) return true
    if (normalized.startsWith('nextval(')) return true
    if (normalized.startsWith('uuid_generate')) return true
    if (normalized.startsWith('(') && normalized.endsWith(')')) return true
    if (extra?.toLowerCase().includes('on update') && normalized.includes('current_timestamp')) {
        return true
    }
    return false
}

/** 优先用表级 AUTO_INCREMENT；否则从当前网格数据推算 max(id)+1 */
export function resolveNextAutoIncrementValues(
    columnDetails: TableColumnDetail[],
    gridColumns: TableColumn[],
    rows: TableRow[],
    tableAutoIncrement?: string | null,
    pendingInsertOffset = 0,
): Record<string, string> {
    const autoColumns = columnDetails.filter((col) => col.autoIncrement)
    if (autoColumns.length === 0) return {}

    let base: number | null = null
    if (tableAutoIncrement != null && tableAutoIncrement !== '') {
        const parsed = Number(tableAutoIncrement)
        if (Number.isFinite(parsed)) base = parsed
    }

    const primaryAuto = autoColumns[0]!
    if (base == null) {
        const gridCol = gridColumns.find((col) => col.name === primaryAuto.name)
        if (gridCol) {
            let max = 0
            for (const row of rows) {
                const value = Number(readRowCell(row, gridCol))
                if (Number.isFinite(value) && value > max) max = value
            }
            if (max > 0) base = max + 1
        }
    }

    if (base == null) return {}

  const next = base + pendingInsertOffset // 连续新增多行时 id 递增
    const values: Record<string, string> = {}
    for (const col of autoColumns) {
        values[col.name] = String(next)
    }
    return values
}

export type InsertDraftContext = {
    tableAutoIncrement?: string | null
    rows?: TableRow[]
    gridColumns?: TableColumn[]
    pendingInsertOffset?: number
}

export function createEmptyInsertDraft(
    columns: TableColumnDetail[],
    context: InsertDraftContext = {},
): Record<string, string> {
    const autoValues = resolveNextAutoIncrementValues(
        columns,
        context.gridColumns ?? [],
        context.rows ?? [],
        context.tableAutoIncrement,
        context.pendingInsertOffset ?? 0,
    )
    const draft: Record<string, string> = {}
    for (const col of columns) {
        if (col.autoIncrement) {
            draft[col.name] = autoValues[col.name] ?? ''
            continue
        }
        if (isSqlExpressionDefault(col.defaultValue, col.extra)) {
            draft[col.name] = ''
            continue
        }
        draft[col.name] = col.defaultValue ?? ''
    }
    return draft
}

export function parseInsertDraftValues(
    draft: Record<string, string>,
    columns: TableColumnDetail[],
): Record<string, string | number | boolean | null> {
    const byName = new Map(columns.map((col) => [col.name, col]))
    const values: Record<string, string | number | boolean | null> = {}

    for (const [name, raw] of Object.entries(draft)) {
        const column = byName.get(name)
        if (!column) continue
    const trimmed = raw.trim()
    // 空值或误填的表达式：省略该列 → 后端/数据库走列 DEFAULT；可空列显式传 NULL
    if (!trimmed || isSqlExpressionDefault(trimmed, column.extra)) {
            if (!column.autoIncrement && column.nullable) {
                values[name] = null
            }
            continue
        }
        values[name] = coerceInsertValue(trimmed, column.dataType ?? '')
    }
    return values
}

function coerceInsertValue(raw: string, dataType: string): string | number | boolean | null {
    const normalized = dataType.toLowerCase()
    if (/^(tinyint\(1\)|bool|boolean)/.test(normalized)) {
        if (raw === '1' || raw.toLowerCase() === 'true') return true
        if (raw === '0' || raw.toLowerCase() === 'false') return false
        return raw
    }
    if (/^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real)/.test(normalized)) {
        const num = Number(raw)
        return Number.isFinite(num) ? num : raw
    }
    return raw
}

export function insertDraftHasValues(draft: Record<string, string>): boolean {
    return Object.values(draft).some((value) => value.trim().length > 0)
}

export type GridRowKeyContext = {
    /** 结果集内行下标；无主键时用于保证行 id 唯一 */
    index?: number
    /** 有主键时仅用主键列拼行 id */
    pkColumns?: string[]
}

export function rowKey(row: TableRow, columns: TableColumn[], context?: GridRowKeyContext): string {
    const keyColumns = context?.pkColumns?.length
        ? columns.filter((col) => context.pkColumns!.includes(col.name))
        : columns
    const content = keyColumns
        .map((col) => `${col.name}:${String(readRowCell(row, col) ?? '')}`)
        .join('|')
    if (!context?.pkColumns?.length && context?.index !== undefined) {
        return `i:${context.index}|${content}`
    }
    return content
}

export {columnRowKey}
