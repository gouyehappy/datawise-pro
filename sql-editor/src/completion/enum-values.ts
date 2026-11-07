import type {SqlColumnMeta} from '@sql-editor/types'
import {classifyColumnType} from './column-type'

export function formatSqlEnumLiteral(value: string, meta?: SqlColumnMeta | null): string {
    const kind = classifyColumnType(meta?.type)
    if (kind === 'numeric' || /^-?\d+(\.\d+)?$/.test(value)) return value
    if (/^(true|false|null)$/i.test(value)) return value.toUpperCase()
    return `'${value.replace(/'/g, "''")}'`
}

export function buildEnumInListLiteral(values: string[], meta?: SqlColumnMeta | null): string {
    return values.map((v) => formatSqlEnumLiteral(v, meta)).join(', ')
}
