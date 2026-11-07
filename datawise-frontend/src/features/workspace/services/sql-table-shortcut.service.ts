import type {DbType} from '@/core/types'
import {quoteSqlIdentifier} from '@/features/connection/services/sql-dialect.service'

/** Default peek size for “first N rows” shortcuts (independent of cursor page size). */
export const DEFAULT_TABLE_SHORTCUT_ROWS = 100

const IDENT_PART = '(?:`[^`]+`|"[^"]+"|\\[[^\\]]+\\]|[A-Za-z_\\u0080-\\uffff][\\w$]*)'
const TABLE_REF_RE = new RegExp(`^${IDENT_PART}(?:\\s*\\.\\s*${IDENT_PART}){0,2}$`)
const SQL_KEYWORD_RE = /\b(select|insert|update|delete|merge|from|where|join|into|values|with|create|alter|drop|truncate)\b/i

export type SqlLimitStyle = 'limit' | 'top' | 'fetch-first'

/** True when the editor selection looks like a bare / qualified table name (not a statement). */
export function isTableNameSelection(selection: string): boolean {
    return parseSelectedTableRef(selection) != null
}

export function parseSelectedTableRef(selection: string): string | null {
    const raw = selection.trim().replace(/;\s*$/, '')
    if (!raw || /\r|\n/.test(raw)) return null
    if (SQL_KEYWORD_RE.test(raw)) return null
    if (!TABLE_REF_RE.test(raw)) return null
    return raw.replace(/\s*\.\s*/g, '.')
}

export function resolveSqlLimitStyle(dbType?: DbType): SqlLimitStyle {
    switch (dbType) {
        case 'sqlserver':
        case 'sybase':
            return 'top'
        case 'oracle':
        case 'dm':
        case 'dameng':
        case 'db2':
        case 'oscar':
            return 'fetch-first'
        default:
            return 'limit'
    }
}

/** Quote each identifier segment unless the selection already includes quotes / brackets. */
export function quoteTableRef(dbType: DbType | undefined, tableRef: string): string {
    if (/[`"\[]/.test(tableRef)) return tableRef
    return tableRef
        .split('.')
        .map((part) => quoteSqlIdentifier(dbType, part))
        .join('.')
}

function normalizeLimit(limit: number): number {
    if (!Number.isFinite(limit)) return DEFAULT_TABLE_SHORTCUT_ROWS
    return Math.max(1, Math.floor(limit))
}

export function buildSelectFirstNSql(
    dbType: DbType | undefined,
    tableRef: string,
    limit: number = DEFAULT_TABLE_SHORTCUT_ROWS,
): string {
    const n = normalizeLimit(limit)
    const from = quoteTableRef(dbType, tableRef)
    switch (resolveSqlLimitStyle(dbType)) {
        case 'top':
            return `SELECT TOP (${n}) * FROM ${from}`
        case 'fetch-first':
            return `SELECT * FROM ${from} FETCH FIRST ${n} ROWS ONLY`
        default:
            return `SELECT * FROM ${from} LIMIT ${n}`
    }
}

export function buildCountRowsSql(dbType: DbType | undefined, tableRef: string): string {
    const from = quoteTableRef(dbType, tableRef)
    return `SELECT COUNT(*) AS cnt FROM ${from}`
}

export function buildTableShortcutSql(
    kind: 'select-first' | 'count',
    selection: string,
    dbType: DbType | undefined,
    limit: number = DEFAULT_TABLE_SHORTCUT_ROWS,
): string | null {
    const tableRef = parseSelectedTableRef(selection)
    if (!tableRef) return null
    return kind === 'count'
        ? buildCountRowsSql(dbType, tableRef)
        : buildSelectFirstNSql(dbType, tableRef, limit)
}
