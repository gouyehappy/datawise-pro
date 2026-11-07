import type {ChartSpec} from '@/shared/charts/chart-spec.types'
import type {TableColumn, TableRow} from '@/core/types'
import {QUERY_RESULT_CHART_SAMPLE_ROWS} from '@/features/workspace/constants/query-result-limits'

export type QueryResultChartType = ChartSpec['type']

export interface QueryResultChartField {
    key: string
    label: string
    kind: 'dimension' | 'measure'
}

export interface QueryResultChartConfig {
    chartType: QueryResultChartType
    xField: string
    yFields: string[]
    title: string
}

const NUMERIC_TYPE_HINTS = [
    'int',
    'decimal',
    'numeric',
    'float',
    'double',
    'real',
    'number',
    'bigint',
    'smallint',
    'tinyint',
    'money',
]

function columnKey(column: TableColumn): string {
    return column.key ?? column.name
}

function readCell(row: TableRow, key: string): unknown {
    return row[key]
}

function isNumericValue(value: unknown): boolean {
    if (value === null || value === undefined) return false
    if (typeof value === 'number') return Number.isFinite(value)
    const text = String(value).trim()
    if (!text) return false
    const numeric = Number(text)
    return Number.isFinite(numeric)
}

function looksNumericColumn(column: TableColumn, rows: TableRow[]): boolean {
    const type = (column.type ?? '').toLowerCase()
    if (NUMERIC_TYPE_HINTS.some((hint) => type.includes(hint))) return true
    const key = columnKey(column)
    const sample = rows.slice(0, Math.min(rows.length, 24))
    if (!sample.length) return false
    let numericCount = 0
    let nonEmpty = 0
    for (const row of sample) {
        const value = readCell(row, key)
        if (value === null || value === undefined || String(value).trim() === '') continue
        nonEmpty += 1
        if (isNumericValue(value)) numericCount += 1
    }
    return nonEmpty > 0 && numericCount / nonEmpty >= 0.8
}

function sampleRowsForChart(rows: TableRow[]): TableRow[] {
    if (rows.length <= QUERY_RESULT_CHART_SAMPLE_ROWS) return rows
    return rows.slice(0, QUERY_RESULT_CHART_SAMPLE_ROWS)
}

function distinctCount(rows: TableRow[], key: string): number {
    const seen = new Set<string>()
    for (const row of rows) {
        const value = readCell(row, key)
        if (value === null || value === undefined) continue
        seen.add(String(value))
        if (seen.size > 64) break
    }
    return seen.size
}

/** 识别可用于图表的维度列与度量列 */
export function inferQueryResultChartFields(
    columns: TableColumn[],
    rows: TableRow[],
): QueryResultChartField[] {
    if (!columns.length || !rows.length) return []
    const sample = sampleRowsForChart(rows)
    return columns.map((column) => {
        const key = columnKey(column)
        return {
            key,
            label: column.name || key,
            kind: looksNumericColumn(column, sample) ? 'measure' : 'dimension',
        } satisfies QueryResultChartField
    })
}

export function canVisualizeQueryResult(columns: TableColumn[], rows: TableRow[]): boolean {
    const fields = inferQueryResultChartFields(columns, rows)
    return fields.some((field) => field.kind === 'dimension')
        && fields.some((field) => field.kind === 'measure')
}

function pickDefaultDimension(fields: QueryResultChartField[], rows: TableRow[]): string {
    const dimensions = fields.filter((field) => field.kind === 'dimension')
    const sample = sampleRowsForChart(rows)
    const ranked = [...dimensions].sort((left, right) => {
        const leftCount = distinctCount(sample, left.key)
        const rightCount = distinctCount(sample, right.key)
        const leftScore = leftCount >= 2 && leftCount <= 24 ? 0 : 1
        const rightScore = rightCount >= 2 && rightCount <= 24 ? 0 : 1
        if (leftScore !== rightScore) return leftScore - rightScore
        return leftCount - rightCount
    })
    return ranked[0]?.key ?? dimensions[0]?.key ?? ''
}

function pickDefaultMeasures(fields: QueryResultChartField[]): string[] {
    return fields.filter((field) => field.kind === 'measure').slice(0, 3).map((field) => field.key)
}

function pickDefaultChartType(dimensionKey: string, measureKeys: string[], rows: TableRow[]): QueryResultChartType {
    const categories = distinctCount(sampleRowsForChart(rows), dimensionKey)
    if (measureKeys.length === 1 && categories > 1 && categories <= 8) return 'pie'
    if (categories > 12) return 'line'
    return 'bar'
}

/** 根据结果集推断默认图表配置 */
export function buildDefaultQueryResultChartConfig(
    columns: TableColumn[],
    rows: TableRow[],
    title = '',
): QueryResultChartConfig | null {
    const sample = sampleRowsForChart(rows)
    const fields = inferQueryResultChartFields(columns, sample)
    const xField = pickDefaultDimension(fields, sample)
    const yFields = pickDefaultMeasures(fields)
    if (!xField || !yFields.length) return null
    return {
        chartType: pickDefaultChartType(xField, yFields, sample),
        xField,
        yFields,
        title,
    }
}

/** Cap rows fed into ECharts / pivot for large result sets. */
export function limitQueryResultChartRows(rows: TableRow[]): TableRow[] {
    return sampleRowsForChart(rows)
}

export function toAiChartSpec(config: QueryResultChartConfig, columns: TableColumn[]): ChartSpec {
    const labelByKey = new Map(columns.map((column) => [columnKey(column), column.name || columnKey(column)]))
    return {
        type: config.chartType,
        title: config.title,
        xField: config.xField,
        yFields: [...config.yFields],
        seriesNames: config.yFields.map((field) => labelByKey.get(field) ?? field),
    }
}

/** 简单透视：按维度聚合度量（sum） */
export function pivotQueryResultRows(
    rows: TableRow[],
    dimensionKey: string,
    measureKeys: string[],
): TableRow[] {
    const grouped = new Map<string, TableRow>()
    for (const row of sampleRowsForChart(rows)) {
        const dimension = readCell(row, dimensionKey)
        const bucketKey = dimension == null ? '' : String(dimension)
        const existing = grouped.get(bucketKey) ?? { [dimensionKey]: bucketKey }
        for (const measureKey of measureKeys) {
            const current = Number(existing[measureKey] ?? 0)
            const next = Number(readCell(row, measureKey) ?? 0)
            existing[measureKey] = Number.isFinite(next) ? current + next : current
        }
        grouped.set(bucketKey, existing)
    }
    return [...grouped.values()]
}
