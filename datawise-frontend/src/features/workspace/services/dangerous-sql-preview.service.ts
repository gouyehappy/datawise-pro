import {requiresWriteAccess} from '@/features/team/services/connection-access.service'
import type {TableRow} from '@/core/types'

export type DangerousSqlKind =
    | 'delete'
    | 'update'
    | 'truncate'
    | 'drop'
    | 'alter'
    | 'create'
    | 'other'

export interface DangerousSqlPreview {
    kind: DangerousSqlKind
    originalSql: string
    tableName?: string
    /** 查询预览用的表引用（可含别名，如 `cdp_tag ct`） */
    tableRef?: string
    whereClause?: string
    /** 无 WHERE 的全表风险 */
    fullTableRisk: boolean
    countSql?: string
    sampleSql?: string
}

function stripTrailingSemicolon(sql: string): string {
    return sql.replace(/;\s*$/, '').trim()
}

function normalizeTableName(raw: string): string {
    return raw.replace(/^[`"]|[`"]$/g, '').split(/\s+/)[0]?.replace(/\.$/, '') ?? raw
}

/** 提取 WHERE 之后条件（忽略表别名等前缀） */
function extractWhereClause(sql: string): string | null {
    const match = sql.match(/\bWHERE\b([\s\S]+)$/i)
    if (!match?.[1]) return null
    return stripTrailingSemicolon(match[1].trim())
}

function buildCountSql(tableRef: string, whereClause?: string | null): string {
    if (whereClause) {
        return `SELECT COUNT(*) AS cnt FROM ${tableRef} WHERE ${whereClause}`
    }
    return `SELECT COUNT(*) AS cnt FROM ${tableRef}`
}

function buildSampleSql(tableRef: string, whereClause?: string | null): string {
    if (whereClause) {
        return `SELECT * FROM ${tableRef} WHERE ${whereClause} LIMIT 20`
    }
    return `SELECT * FROM ${tableRef} LIMIT 20`
}

export function analyzeDangerousSql(sql: string): DangerousSqlPreview | null {
    const trimmed = stripTrailingSemicolon(sql.trim())
    if (!trimmed || !requiresWriteAccess(trimmed)) {
        return null
    }

    const upper = trimmed.toUpperCase()
    if (upper.startsWith('INSERT ') || upper.startsWith('REPLACE ')) {
        return null
    }

    const deletePrefix = trimmed.match(/^DELETE\s+FROM\s+/i)
    if (deletePrefix) {
        const afterFrom = trimmed.slice(deletePrefix[0].length)
        const whereIndex = afterFrom.search(/\bWHERE\b/i)
        const tableRef = whereIndex >= 0
            ? afterFrom.slice(0, whereIndex).trim()
            : afterFrom.trim()
        const whereClause = extractWhereClause(trimmed)
        const tableName = normalizeTableName(tableRef)
        const fullTableRisk = !whereClause
        return {
            kind: 'delete',
            originalSql: sql,
            tableName,
            tableRef,
            whereClause: whereClause ?? undefined,
            fullTableRisk,
            countSql: buildCountSql(tableRef, whereClause),
            sampleSql: buildSampleSql(tableRef, whereClause),
        }
    }

    const updatePrefix = trimmed.match(/^UPDATE\s+/i)
    if (updatePrefix) {
        const afterUpdate = trimmed.slice(updatePrefix[0].length)
        const setIndex = afterUpdate.search(/\bSET\b/i)
        if (setIndex < 0) {
            return {kind: 'update', originalSql: sql, fullTableRisk: true}
        }
        const tableRef = afterUpdate.slice(0, setIndex).trim()
        const whereClause = extractWhereClause(trimmed)
        const tableName = normalizeTableName(tableRef)
        const fullTableRisk = !whereClause
        return {
            kind: 'update',
            originalSql: sql,
            tableName,
            tableRef,
            whereClause: whereClause ?? undefined,
            fullTableRisk,
            countSql: buildCountSql(tableRef, whereClause),
            sampleSql: buildSampleSql(tableRef, whereClause),
        }
    }

    const truncateMatch = trimmed.match(/^TRUNCATE\s+(?:TABLE\s+)?((?:`[^`]+`|"[^"]+"|\w+)(?:\s*\.\s*(?:`[^`]+`|"[^"]+"|\w+))?)/is)
    if (truncateMatch) {
        const tableRef = truncateMatch[1].replace(/\s+/g, '')
        return {
            kind: 'truncate',
            originalSql: sql,
            tableName: normalizeTableName(tableRef),
            tableRef,
            fullTableRisk: true,
        }
    }

    const dropMatch = trimmed.match(/^DROP\s+(?:TABLE\s+)?((?:`[^`]+`|"[^"]+"|\w+)(?:\s*\.\s*(?:`[^`]+`|"[^"]+"|\w+))?)/is)
    if (dropMatch) {
        const tableRef = dropMatch[1].replace(/\s+/g, '')
        return {
            kind: 'drop',
            originalSql: sql,
            tableName: normalizeTableName(tableRef),
            tableRef,
            fullTableRisk: true,
        }
    }

    return null
}

export function isDangerousSql(sql: string): boolean {
    return analyzeDangerousSql(sql) != null
}

export function readCountFromPreviewRows(rows: TableRow[]): number | null {
    const first = rows[0]
    if (!first) return null
    for (const value of Object.values(first)) {
        if (typeof value === 'number' && Number.isFinite(value)) return value
        if (value != null && String(value).trim() && !Number.isNaN(Number(value))) {
            return Number(value)
        }
    }
    return null
}
