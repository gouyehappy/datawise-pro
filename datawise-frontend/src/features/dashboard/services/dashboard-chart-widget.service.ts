import {createId} from '@/core/utils/id'
import type {TableColumn, TableRow} from '@/core/types'
import {
    pivotQueryResultRows,
    type QueryResultChartConfig,
} from '@/features/workspace/services/query-result-chart.service'

export const DASHBOARD_CHART_WIDGET_MAX_ROWS = 500

export type DashboardChartWidgetColumn = 'left' | 'main' | 'right'

export interface DashboardChartWidget {
    id: string
    column: DashboardChartWidgetColumn
    visible: boolean
    title: string
    config: QueryResultChartConfig
    pivotEnabled: boolean
    columns: TableColumn[]
    rows: TableRow[]
    createdAt: number
}

export interface DashboardChartWidgetPrefs {
    chartWidgets?: DashboardChartWidget[] | unknown[]
}

export interface CreateDashboardChartWidgetInput {
    title: string
    column: DashboardChartWidgetColumn
    config: QueryResultChartConfig
    pivotEnabled: boolean
    columns: TableColumn[]
    rows: TableRow[]
}

function isWidgetColumn(value: unknown): value is DashboardChartWidgetColumn {
    return value === 'left' || value === 'main' || value === 'right'
}

function isChartType(value: unknown): value is QueryResultChartConfig['chartType'] {
    return value === 'bar' || value === 'line' || value === 'pie'
}

function normalizeColumns(raw: unknown): TableColumn[] {
    if (!Array.isArray(raw)) return []
    return raw
        .filter((item): item is TableColumn =>
            !!item && typeof item === 'object' && typeof (item as TableColumn).name === 'string',
        )
        .map((column) => ({
            name: column.name,
            key: typeof column.key === 'string' ? column.key : column.name,
            type: typeof column.type === 'string' ? column.type : undefined,
        }))
}

function normalizeRows(raw: unknown): TableRow[] {
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is TableRow => !!item && typeof item === 'object')
}

function normalizeChartConfig(raw: unknown): QueryResultChartConfig | null {
    if (!raw || typeof raw !== 'object') return null
    const item = raw as Partial<QueryResultChartConfig>
    if (!isChartType(item.chartType)) return null
    if (typeof item.xField !== 'string' || !item.xField) return null
    if (!Array.isArray(item.yFields) || !item.yFields.length) return null
    const yFields = item.yFields.filter((field): field is string => typeof field === 'string' && !!field)
    if (!yFields.length) return null
    return {
        chartType: item.chartType,
        xField: item.xField,
        yFields,
        title: typeof item.title === 'string' ? item.title : '',
    }
}

export function snapshotChartWidgetRows(
    rows: TableRow[],
    config: QueryResultChartConfig,
    pivotEnabled: boolean,
    maxRows = DASHBOARD_CHART_WIDGET_MAX_ROWS,
): TableRow[] {
    const source = pivotEnabled
        ? pivotQueryResultRows(rows, config.xField, config.yFields)
        : rows
    return source.slice(0, maxRows)
}

export function createDashboardChartWidget(input: CreateDashboardChartWidgetInput): DashboardChartWidget {
    const title = input.title.trim() || input.config.title
    return {
        id: createId('chart'),
        column: input.column,
        visible: true,
        title,
        config: {...input.config, title},
        pivotEnabled: input.pivotEnabled,
        columns: input.columns.map((column) => ({...column})),
        rows: snapshotChartWidgetRows(input.rows, input.config, input.pivotEnabled),
        createdAt: Date.now(),
    }
}

export function normalizeChartWidgets(raw: unknown): DashboardChartWidget[] {
    if (!Array.isArray(raw)) return []
    const widgets: DashboardChartWidget[] = []
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        const record = item as Partial<DashboardChartWidget>
        const config = normalizeChartConfig(record.config)
        const columns = normalizeColumns(record.columns)
        const rows = normalizeRows(record.rows)
        if (!config || !columns.length || !rows.length) continue
        widgets.push({
            id: typeof record.id === 'string' && record.id ? record.id : createId('chart'),
            column: isWidgetColumn(record.column) ? record.column : 'main',
            visible: record.visible !== false,
            title: typeof record.title === 'string' ? record.title : config.title,
            config,
            pivotEnabled: record.pivotEnabled === true,
            columns,
            rows: rows.slice(0, DASHBOARD_CHART_WIDGET_MAX_ROWS),
            createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
        })
    }
    return widgets.sort((left, right) => right.createdAt - left.createdAt)
}

export function chartWidgetsForColumn(
    prefs: DashboardChartWidgetPrefs,
    column: DashboardChartWidgetColumn,
): DashboardChartWidget[] {
    return normalizeChartWidgets(prefs.chartWidgets)
        .filter((widget) => widget.column === column && widget.visible)
        .sort((left, right) => right.createdAt - left.createdAt)
}

export function addDashboardChartWidget<T extends DashboardChartWidgetPrefs>(
    prefs: T,
    widget: DashboardChartWidget,
): T & {chartWidgets: DashboardChartWidget[]} {
    return {
        ...prefs,
        chartWidgets: [widget, ...normalizeChartWidgets(prefs.chartWidgets)],
    }
}

export function removeDashboardChartWidget<T extends DashboardChartWidgetPrefs>(
    prefs: T,
    id: string,
): T & {chartWidgets: DashboardChartWidget[]} {
    return {
        ...prefs,
        chartWidgets: normalizeChartWidgets(prefs.chartWidgets).filter((widget) => widget.id !== id),
    }
}

export function setChartWidgetVisibility<T extends DashboardChartWidgetPrefs>(
    prefs: T,
    id: string,
    visible: boolean,
): T & {chartWidgets: DashboardChartWidget[]} {
    return {
        ...prefs,
        chartWidgets: normalizeChartWidgets(prefs.chartWidgets).map((widget) =>
            widget.id === id ? {...widget, visible} : widget,
        ),
    }
}

export function setChartWidgetColumn<T extends DashboardChartWidgetPrefs>(
    prefs: T,
    id: string,
    column: DashboardChartWidgetColumn,
): T & {chartWidgets: DashboardChartWidget[]} {
    return {
        ...prefs,
        chartWidgets: normalizeChartWidgets(prefs.chartWidgets).map((widget) =>
            widget.id === id ? {...widget, column} : widget,
        ),
    }
}
