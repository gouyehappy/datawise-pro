/** Dashboard layout prefs used by app-config (chart payload stays opaque here). */

export type DashboardWidgetId =
    | 'quickActions'
    | 'connectionHealth'
    | 'onCallConnections'
    | 'recentSql'
    | 'openTabs'
    | 'savedConsoles'
    | 'enabledPlugins'
    | 'teamActivity'
    | 'recentAnalysis'

export type DashboardWidgetColumn = 'left' | 'main' | 'right'

export interface DashboardWidgetConfig {
    id: DashboardWidgetId
    column: DashboardWidgetColumn
    visible: boolean
}

export interface DashboardPreferences {
    widgets: DashboardWidgetConfig[]
    /** Opaque chart widgets; feature layer normalizes to typed DashboardChartWidget[]. */
    chartWidgets: unknown[]
}

export const DASHBOARD_WIDGET_IDS: DashboardWidgetId[] = [
    'quickActions',
    'connectionHealth',
    'onCallConnections',
    'recentSql',
    'openTabs',
    'savedConsoles',
    'enabledPlugins',
    'teamActivity',
    'recentAnalysis',
]

const DASHBOARD_WIDGET_COLUMNS: DashboardWidgetColumn[] = ['left', 'main', 'right']

export const DEFAULT_DASHBOARD_WIDGET_COLUMN: Record<DashboardWidgetId, DashboardWidgetColumn> = {
    quickActions: 'left',
    connectionHealth: 'left',
    onCallConnections: 'main',
    recentSql: 'main',
    openTabs: 'right',
    savedConsoles: 'right',
    enabledPlugins: 'right',
    teamActivity: 'right',
    recentAnalysis: 'main',
}

function isWidgetId(value: unknown): value is DashboardWidgetId {
    return typeof value === 'string' && DASHBOARD_WIDGET_IDS.includes(value as DashboardWidgetId)
}

function isWidgetColumn(value: unknown): value is DashboardWidgetColumn {
    return typeof value === 'string' && DASHBOARD_WIDGET_COLUMNS.includes(value as DashboardWidgetColumn)
}

export function createDefaultDashboardPreferences(): DashboardPreferences {
    return {
        widgets: DASHBOARD_WIDGET_IDS.map((id) => ({
            id,
            column: DEFAULT_DASHBOARD_WIDGET_COLUMN[id],
            visible: true,
        })),
        chartWidgets: [],
    }
}

/** Normalize widget layout; chartWidgets preserved as opaque array. */
export function normalizeDashboardPreferences(
    raw: Partial<DashboardPreferences> | undefined,
): DashboardPreferences {
    const defaults = createDefaultDashboardPreferences()
    const byId = new Map<DashboardWidgetId, DashboardWidgetConfig>()
    for (const item of defaults.widgets) {
        byId.set(item.id, {...item})
    }

    if (Array.isArray(raw?.widgets)) {
        for (const item of raw.widgets) {
            if (!item || !isWidgetId(item.id)) continue
            const base = byId.get(item.id) ?? {
                id: item.id,
                column: DEFAULT_DASHBOARD_WIDGET_COLUMN[item.id],
                visible: true,
            }
            byId.set(item.id, {
                id: item.id,
                column: isWidgetColumn(item.column) ? item.column : base.column,
                visible: typeof item.visible === 'boolean' ? item.visible : base.visible,
            })
        }
    }

    return {
        widgets: DASHBOARD_WIDGET_IDS.map((id) => byId.get(id)!),
        chartWidgets: Array.isArray(raw?.chartWidgets) ? [...raw.chartWidgets] : [],
    }
}
