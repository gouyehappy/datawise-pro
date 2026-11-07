import type {TableColumn, TableRow} from '@/core/types'
import {readRowCell} from '@/core/utils/query-result-column'
import {formatCellFullValue, unwrapCellValue} from '@/core/utils/cell-value-format'
import {
    GRID_COLUMN_STATS_MAX_DISTINCT,
    GRID_COLUMN_STATS_MAX_ROWS,
} from '@/shared/config/query-result-limits'

export interface GridColumnStats {
    columnName: string
    columnType?: string
    rowCount: number
    nullCount: number
    nonNullCount: number
    distinctCount: number
    numericMin?: number
    numericMax?: number
    numericAvg?: number
    topValues: Array<{ value: string; count: number }>
}

const TOP_VALUE_LIMIT = 5

function isNumericValue(value: unknown): boolean {
    if (value === null || value === undefined) return false
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value === 'string' && value.trim() !== '') return Number.isFinite(Number(value))
    return false
}

function toNumeric(value: unknown): number {
    return typeof value === 'number' ? value : Number(String(value))
}

function displayValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL'
    const text = formatCellFullValue(unwrapCellValue(value))
    return text.length > 64 ? `${text.slice(0, 61)}…` : text
}

/** 基于当前筛选结果集计算单列统计 */
export function computeGridColumnStats(column: TableColumn, rows: TableRow[]): GridColumnStats {
    let nullCount = 0
    const distinct = new Map<string, number>()
    let numericMin: number | undefined
    let numericMax: number | undefined
    let numericSum = 0
    let numericCount = 0
    const scanRows = rows.length > GRID_COLUMN_STATS_MAX_ROWS
        ? rows.slice(0, GRID_COLUMN_STATS_MAX_ROWS)
        : rows

    for (const row of scanRows) {
        const value = readRowCell(row, column)
        if (value === null || value === undefined) {
            nullCount++
            continue
        }

        const label = displayValue(value)
        const prior = distinct.get(label)
        if (prior !== undefined) {
            distinct.set(label, prior + 1)
        } else if (distinct.size < GRID_COLUMN_STATS_MAX_DISTINCT) {
            distinct.set(label, 1)
        }

        if (isNumericValue(value)) {
            const numeric = toNumeric(value)
            numericCount++
            numericSum += numeric
            numericMin = numericMin === undefined ? numeric : Math.min(numericMin, numeric)
            numericMax = numericMax === undefined ? numeric : Math.max(numericMax, numeric)
        }
    }

    const topValues = [...distinct.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, TOP_VALUE_LIMIT)
        .map(([value, count]) => ({value, count}))

    return {
        columnName: column.name,
        columnType: column.type,
        rowCount: scanRows.length,
        nullCount,
        nonNullCount: scanRows.length - nullCount,
        distinctCount: distinct.size,
        numericMin: numericCount > 0 ? numericMin : undefined,
        numericMax: numericCount > 0 ? numericMax : undefined,
        numericAvg: numericCount > 0 ? numericSum / numericCount : undefined,
        topValues,
    }
}

export function formatGridColumnStatsLines(stats: GridColumnStats): string[] {
    const lines = [
        `${stats.columnName}: rows=${stats.rowCount}, nulls=${stats.nullCount}, distinct=${stats.distinctCount}`,
    ]
    if (stats.numericMin !== undefined && stats.numericMax !== undefined) {
        const avg = stats.numericAvg !== undefined ? `, avg=${formatNumber(stats.numericAvg)}` : ''
        lines.push(`range ${formatNumber(stats.numericMin)}..${formatNumber(stats.numericMax)}${avg}`)
    }
    if (stats.topValues.length) {
        lines.push(
            `top: ${stats.topValues.map((item) => `${item.value}×${item.count}`).join(', ')}`,
        )
    }
    return lines
}

function formatNumber(value: number): string {
    if (Number.isInteger(value)) return String(value)
    return value.toFixed(4).replace(/\.?0+$/, '')
}
