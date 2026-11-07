import type {
    DashboardChartWidget,
} from '@/features/dashboard/services/dashboard-chart-widget.service'
import {normalizeChartWidgets} from '@/features/dashboard/services/dashboard-chart-widget.service'
import {
    createDefaultDashboardPreferences as createDefaultDashboardPreferencesShared,
    normalizeDashboardPreferences as normalizeDashboardPreferencesShared,
    DASHBOARD_WIDGET_IDS,
    DEFAULT_DASHBOARD_WIDGET_COLUMN,
    type DashboardWidgetColumn,
    type DashboardWidgetConfig,
    type DashboardWidgetId,
    type DashboardPreferences as SharedDashboardPreferences,
} from '@/shared/config/dashboard-preferences'

export type {
    DashboardWidgetId,
    DashboardWidgetColumn,
    DashboardWidgetConfig,
}

export type {DashboardChartWidget}

export {DASHBOARD_WIDGET_IDS, DEFAULT_DASHBOARD_WIDGET_COLUMN}

export interface DashboardPreferences {
    widgets: DashboardWidgetConfig[]
    chartWidgets: DashboardChartWidget[]
}

export function createDefaultDashboardPreferences(): DashboardPreferences {
    const base = createDefaultDashboardPreferencesShared()
    return {widgets: base.widgets, chartWidgets: []}
}

export function normalizeDashboardPreferences(
    raw: Partial<DashboardPreferences | SharedDashboardPreferences> | undefined,
): DashboardPreferences {
    const base = normalizeDashboardPreferencesShared(raw as Partial<SharedDashboardPreferences> | undefined)
    return {
        widgets: base.widgets,
        chartWidgets: normalizeChartWidgets(
            (raw as Partial<DashboardPreferences> | undefined)?.chartWidgets ?? base.chartWidgets,
        ),
    }
}

export function widgetsForColumn(
    prefs: SharedDashboardPreferences | DashboardPreferences,
    column: DashboardWidgetColumn,
): DashboardWidgetConfig[] {
    return prefs.widgets.filter((widget) => widget.column === column && widget.visible)
}

export function visibleWidgetIdsForColumn(
    prefs: SharedDashboardPreferences | DashboardPreferences,
    column: DashboardWidgetColumn,
): DashboardWidgetId[] {
    return widgetsForColumn(prefs, column).map((widget) => widget.id)
}

export function reorderWidgetInColumn(
    prefs: DashboardPreferences,
    column: DashboardWidgetColumn,
    fromIndex: number,
    toIndex: number,
): DashboardPreferences {
    const widgets = [...prefs.widgets]
    const columnIndices = widgets
        .map((widget, index) => ({widget, index}))
        .filter((entry) => entry.widget.column === column)
        .map((entry) => entry.index)

    if (fromIndex < 0 || fromIndex >= columnIndices.length) return prefs
    if (toIndex < 0 || toIndex >= columnIndices.length) return prefs
    if (fromIndex === toIndex) return prefs

    const fromGlobal = columnIndices[fromIndex]!
    const toGlobal = columnIndices[toIndex]!
    const next = [...widgets]
    const [moved] = next.splice(fromGlobal, 1)
    next.splice(toGlobal, 0, moved)
    return {...prefs, widgets: next}
}

export function setWidgetVisibility(
    prefs: DashboardPreferences,
    id: DashboardWidgetId,
    visible: boolean,
): DashboardPreferences {
    return {
        ...prefs,
        widgets: prefs.widgets.map((widget) =>
            widget.id === id ? {...widget, visible} : widget,
        ),
    }
}

export function setWidgetColumn(
    prefs: DashboardPreferences,
    id: DashboardWidgetId,
    column: DashboardWidgetColumn,
): DashboardPreferences {
    const widgets = [...prefs.widgets]
    const index = widgets.findIndex((widget) => widget.id === id)
    if (index < 0) return prefs
    const current = widgets[index]!
    if (current.column === column) return prefs

    widgets.splice(index, 1)
    const lastInColumn = widgets.reduce(
        (last, widget, widgetIndex) => (widget.column === column ? widgetIndex : last),
        -1,
    )
    const insertAt = lastInColumn >= 0 ? lastInColumn + 1 : widgets.length
    widgets.splice(insertAt, 0, {...current, column})
    return {...prefs, widgets}
}

export function replaceDashboardWidgets(
    widgets: DashboardWidgetConfig[],
    chartWidgets?: DashboardChartWidget[],
): DashboardPreferences {
    return normalizeDashboardPreferences({widgets, chartWidgets})
}

/** 同列排序或跨列移动 widget 到目标索引 */
export function moveWidget(
    prefs: DashboardPreferences,
    id: DashboardWidgetId,
    targetColumn: DashboardWidgetColumn,
    targetIndex: number,
): DashboardPreferences {
    const sourceColumn = prefs.widgets.find((widget) => widget.id === id)?.column
    if (!sourceColumn) return prefs

    let next = sourceColumn === targetColumn
        ? prefs
        : setWidgetColumn(prefs, id, targetColumn)

    const columnIds = visibleWidgetIdsForColumn(next, targetColumn)
    const currentIndex = columnIds.indexOf(id)
    if (currentIndex < 0) return next

    const clampedIndex = Math.max(0, Math.min(targetIndex, columnIds.length - 1))
    if (currentIndex === clampedIndex) return next
    return reorderWidgetInColumn(next, targetColumn, currentIndex, clampedIndex)
}

/** Coerce shared/app-config prefs into feature-typed dashboard prefs (charts normalized). */
export function asDashboardPreferences(
    prefs: SharedDashboardPreferences | DashboardPreferences | undefined,
): DashboardPreferences {
    return normalizeDashboardPreferences(prefs)
}
