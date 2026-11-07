import type {SchemaTableSummary} from '@/shared/api/types'

export type SchemaTableRow = SchemaTableSummary

export function filterSchemaTableRows(rows: SchemaTableRow[], keyword: string): SchemaTableRow[] {
    const query = keyword.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) =>
        row.tableName.toLowerCase().includes(query)
        || (row.comment ?? '').toLowerCase().includes(query)
        || (row.engine ?? '').toLowerCase().includes(query))
}

export function formatSchemaTableRowCount(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '—'
    return value.toLocaleString()
}

export function formatSchemaTableDataLength(value: number | null | undefined): string {
    if (value == null || value < 0) return '—'
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatSchemaTableCreateTime(value: string | null | undefined): string {
    if (!value?.trim()) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    const pad = (part: number) => String(part).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function displaySchemaTableText(value: string | null | undefined): string {
    const trimmed = value?.trim()
    return trimmed ? trimmed : '—'
}
