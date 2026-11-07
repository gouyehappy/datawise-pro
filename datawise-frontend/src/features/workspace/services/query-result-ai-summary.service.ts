import type {TableColumn, TableRow} from '@/core/types'
import type {QueryResultItem} from '@/features/workspace/types'
import type {AppLocale} from '@/i18n'

export const QUERY_RESULT_AI_SAMPLE_ROWS = 20
export const QUERY_RESULT_AI_SCHEMA_ONLY_THRESHOLD = 500

export interface QueryResultColumnStat {
    name: string
    type?: string
    nullCount: number
    nonNullCount: number
    distinctSampleValues: string[]
    numericMin?: number | null
    numericMax?: number | null
}

export interface QueryResultSummaryPayload {
    mode: 'sample' | 'schema_only'
    sql: string
    rowCount: number
    loadedRowCount: number
    columnCount: number
    columns: QueryResultColumnStat[]
    sampleRows?: Record<string, unknown>[]
    durationMs: number
}

function columnKey(column: TableColumn): string {
    return column.key ?? column.name
}

function isNumericValue(value: unknown): boolean {
    if (value === null || value === undefined) return false
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value === 'string' && value.trim() !== '') {
        return Number.isFinite(Number(value))
    }
    return false
}

function toNumeric(value: unknown): number {
    return typeof value === 'number' ? value : Number(String(value))
}

function toDisplayValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
}

export function computeQueryResultColumnStats(
    columns: TableColumn[],
    rows: TableRow[],
): QueryResultColumnStat[] {
    return columns.map((column) => {
        const key = columnKey(column)
        let nullCount = 0
        const distinct = new Set<string>()
        let numericMin: number | null = null
        let numericMax: number | null = null
        let numericSeen = 0

        for (const row of rows) {
            const value = row[key]
            if (value === null || value === undefined) {
                nullCount++
                continue
            }

            const display = toDisplayValue(value)
            if (distinct.size < 8) {
                distinct.add(display.length > 80 ? `${display.slice(0, 77)}...` : display)
            }

            if (isNumericValue(value)) {
                const numeric = toNumeric(value)
                numericSeen++
                numericMin = numericMin === null ? numeric : Math.min(numericMin, numeric)
                numericMax = numericMax === null ? numeric : Math.max(numericMax, numeric)
            }
        }

        return {
            name: column.name,
            type: column.type,
            nullCount,
            nonNullCount: rows.length - nullCount,
            distinctSampleValues: [...distinct].slice(0, 5),
            numericMin: numericSeen > 0 ? numericMin : undefined,
            numericMax: numericSeen > 0 ? numericMax : undefined,
        }
    })
}

const AI_SAMPLE_CELL_MAX_CHARS = 200

function serializeSampleCell(value: unknown): unknown {
    if (value === null || value === undefined) return null
    if (typeof value === 'string' && value.length > AI_SAMPLE_CELL_MAX_CHARS) {
        return `${value.slice(0, AI_SAMPLE_CELL_MAX_CHARS)}…`
    }
    if (typeof value === 'object') {
        try {
            const text = JSON.stringify(value)
            if (text.length > AI_SAMPLE_CELL_MAX_CHARS) {
                return `${text.slice(0, AI_SAMPLE_CELL_MAX_CHARS)}…`
            }
            return value
        } catch {
            return String(value).slice(0, AI_SAMPLE_CELL_MAX_CHARS)
        }
    }
    return value
}

function serializeSampleRow(row: TableRow, columns: TableColumn[]): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const column of columns) {
        const key = columnKey(column)
        out[column.name] = serializeSampleCell(row[key] ?? null)
    }
    return out
}

export function buildQueryResultSummaryPayload(result: QueryResultItem): QueryResultSummaryPayload | null {
    if (result.status !== 'success' || result.columns.length === 0) return null

    const loadedRowCount = result.rows.length
    const rowCount = Math.max(result.total, loadedRowCount)
    const mode = rowCount > QUERY_RESULT_AI_SCHEMA_ONLY_THRESHOLD ? 'schema_only' : 'sample'
    const sampleSource = mode === 'sample' ? result.rows.slice(0, QUERY_RESULT_AI_SAMPLE_ROWS) : []

    return {
        mode,
        sql: result.sql.trim(),
        rowCount,
        loadedRowCount,
        columnCount: result.columns.length,
        columns:
            mode === 'schema_only'
                ? result.columns.map((column) => ({
                      name: column.name,
                      type: column.type,
                      nullCount: 0,
                      nonNullCount: 0,
                      distinctSampleValues: [],
                  }))
                : computeQueryResultColumnStats(result.columns, sampleSource),
        sampleRows:
            mode === 'sample'
                ? sampleSource.map((row) => serializeSampleRow(row, result.columns))
                : undefined,
        durationMs: result.durationMs,
    }
}

function formatColumnStatLines(columns: QueryResultColumnStat[]): string {
    return columns
        .map((column) => {
            const typeSuffix = column.type ? ` (${column.type})` : ''
            if (column.nonNullCount === 0 && column.nullCount === 0) {
                return `- ${column.name}${typeSuffix}`
            }
            const parts = [`- ${column.name}${typeSuffix}: nulls=${column.nullCount}, nonNull=${column.nonNullCount}`]
            if (column.distinctSampleValues.length) {
                parts.push(`samples=[${column.distinctSampleValues.join(', ')}]`)
            }
            if (column.numericMin !== undefined || column.numericMax !== undefined) {
                parts.push(`range=${column.numericMin ?? '?'}..${column.numericMax ?? '?'}`)
            }
            return parts.join(', ')
        })
        .join('\n')
}

export function formatQueryResultSummaryPrompt(
    payload: QueryResultSummaryPayload,
    locale: AppLocale,
): string {
    const language = locale === 'zh-CN' ? 'Chinese' : 'English'
    const lines = [
        `Summarize this SQL query result for a data analyst. Reply in ${language} using 3-6 concise bullet points.`,
        'Focus on patterns, outliers, null rates, and business meaning. Do not invent rows not shown.',
        '',
        'SQL:',
        '```sql',
        payload.sql || '(unknown)',
        '```',
        '',
        `Rows: ${payload.rowCount} total (${payload.loadedRowCount} loaded in UI)`,
        `Columns: ${payload.columnCount}`,
        `Duration: ${payload.durationMs}ms`,
        `Sampling mode: ${payload.mode}`,
        '',
        'Column statistics:',
        formatColumnStatLines(payload.columns),
    ]

    if (payload.sampleRows?.length) {
        lines.push('', 'Sample rows (JSON):', JSON.stringify(payload.sampleRows, null, 2))
    }

    return lines.join('\n')
}
