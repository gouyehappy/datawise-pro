import type {AiChartSpec} from '@/features/ai/types/analysis'
import type {TableColumn, TableRow} from '@/core/types'

export {buildChartOption, buildAiChartOption} from '@/shared/charts/build-chart-option'

export function normalizeChartSpec(
    chart: Record<string, unknown> | null | undefined,
): AiChartSpec | null {
    if (!chart || typeof chart.type !== 'string') return null
    const type = chart.type
    if (type !== 'bar' && type !== 'line' && type !== 'pie') return null
    return {
        type,
        title: String(chart.title ?? ''),
        xField: String(chart.xField ?? ''),
        yFields: Array.isArray(chart.yFields) ? chart.yFields.map(String) : [],
        seriesNames: Array.isArray(chart.seriesNames) ? chart.seriesNames.map(String) : [],
    }
}

export function normalizeAnalysisColumns(
    columns: Array<Record<string, unknown>> | undefined,
): TableColumn[] {
    if (!columns?.length) return []
    return columns.map((column) => ({
        name: String(column.name ?? ''),
        key: column.key != null ? String(column.key) : String(column.name ?? ''),
        type: column.type != null ? String(column.type) : undefined,
    }))
}

export function normalizeAnalysisRows(
    rows: Array<Record<string, unknown>> | undefined,
): TableRow[] {
    if (!rows?.length) return []
    return rows.map((row) => {
        const normalized: TableRow = {}
        for (const [key, value] of Object.entries(row)) {
            if (value === null || value === undefined) {
                normalized[key] = null
            } else if (typeof value === 'number') {
                normalized[key] = value
            } else {
                normalized[key] = String(value)
            }
        }
        return normalized
    })
}
