import type {DbType} from '@/core/types'
import {buildQualifiedTableName, quoteSqlIdentifier} from '@/features/connection/services/sql-dialect.service'

const PGVECTOR_DB_TYPES = new Set<DbType>([
    'postgresql',
    'kingbase',
    'opengauss',
    'greenplum',
    'highgo',
    'gaussdb',
])

export const DEFAULT_VECTOR_PREVIEW_LIMIT = 20

export function supportsVectorPreview(dbType?: DbType): boolean {
    return !!dbType && PGVECTOR_DB_TYPES.has(dbType)
}

export function isVectorColumnType(dataType?: string | null): boolean {
    return /\bvector\b/i.test(dataType ?? '')
}

/** Accepts `[1,2]`, `(1, 2)`, or `1,2`. Returns a pgvector literal without casts. */
export function parseVectorLiteral(raw: string): string | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const inner = trimmed.replace(/^[\[(]\s*/, '').replace(/\s*[\])]$/, '')
    const parts = inner.split(',').map((part) => part.trim()).filter(Boolean)
    if (!parts.length) return null
    if (!parts.every((part) => /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(part))) return null
    return `[${parts.join(',')}]`
}

export function buildVectorPreviewSql(input: {
    dbType?: DbType
    database?: string
    tableName: string
    columnName: string
    vectorText: string
    limit?: number
}): string | null {
    if (!supportsVectorPreview(input.dbType)) return null
    if (!input.tableName.trim() || !input.columnName.trim()) return null
    const literal = parseVectorLiteral(input.vectorText)
    if (!literal) return null
    const limit = Math.max(1, Math.min(200, Math.floor(input.limit ?? DEFAULT_VECTOR_PREVIEW_LIMIT)))
    const table = buildQualifiedTableName(input.dbType, input.database ?? '', input.tableName)
    const column = quoteSqlIdentifier(input.dbType, input.columnName)
    const vector = `'${literal}'::vector`
    return [
        `SELECT 1 - (${column} <=> ${vector}) AS score, *`,
        `FROM ${table}`,
        `ORDER BY ${column} <=> ${vector}`,
        `LIMIT ${limit}`,
    ].join('\n')
}
