import type {SavedConsole, SqlLogEntry, TreeNode} from '@/core/types'
import {walkTree} from '@/core/utils/tree'

export type DashboardStatKey = 'connections' | 'sqlRuns' | 'savedConsoles' | 'plugins'

export type DashboardNavTarget = 'database' | 'plugin'

export interface DashboardStatItem {
    key: DashboardStatKey
    value: number
    /** 点击统计卡时跳转的模块；null 表示仅展示 */
    navTarget: DashboardNavTarget | null
}

export interface DashboardConnectionRow {
    id: string
    name: string
    dbType: string
    status: 'ok' | 'error' | 'unknown'
}

export type DashboardQuickActionId = 'newConsole' | 'continueWork' | 'openAi' | 'openPlugins'

export interface DashboardQuickAction {
    id: DashboardQuickActionId
    /** 无打开 Tab 时不展示「继续工作」 */
    hidden?: boolean
}

export function buildDashboardStats(input: {
    connectionCount: number
    sqlLogCount: number
    savedConsoleCount: number
    enabledPluginCount: number
}): DashboardStatItem[] {
    return [
        {key: 'connections', value: input.connectionCount, navTarget: 'database'},
        {key: 'sqlRuns', value: input.sqlLogCount, navTarget: 'database'},
        {key: 'savedConsoles', value: input.savedConsoleCount, navTarget: 'database'},
        {key: 'plugins', value: input.enabledPluginCount, navTarget: 'plugin'},
    ]
}

export function extractDashboardConnections(
    tree: TreeNode[],
    healthById: Record<string, 'ok' | 'error'>,
): DashboardConnectionRow[] {
    const rows: DashboardConnectionRow[] = []
    walkTree(tree, (node) => {
        if (node.type !== 'connection') return
        const health = healthById[node.id]
        rows.push({
            id: node.id,
            name: node.label,
            dbType: node.dbType ?? 'mysql',
            status: health ?? 'unknown',
        })
    })
    return rows
}

export function summarizeConnectionHealth(rows: readonly DashboardConnectionRow[]) {
    let ok = 0
    let error = 0
    let unknown = 0
    for (const row of rows) {
        if (row.status === 'ok') ok++
        else if (row.status === 'error') error++
        else unknown++
    }
    return {ok, error, unknown, total: rows.length}
}

export function collectConnectionIds(tree: TreeNode[]): string[] {
    const ids: string[] = []
    walkTree(tree, (node) => {
        if (node.type === 'connection') ids.push(node.id)
    })
    return ids
}

export function pickRecentSqlLogs(logs: SqlLogEntry[], limit = 5): SqlLogEntry[] {
    return logs.slice(0, limit)
}

export function pickRecentSavedConsoles(consoles: SavedConsole[], limit = 5): SavedConsole[] {
    return consoles.slice(0, limit)
}

export function pickEnabledPlugins<T extends { enabled: boolean }>(items: T[], limit = 6): T[] {
    return items.filter((item) => item.enabled).slice(0, limit)
}

export function buildDashboardQuickActions(hasOpenTabs: boolean): DashboardQuickAction[] {
    return [
        {id: 'newConsole'},
        {id: 'continueWork', hidden: !hasOpenTabs},
        {id: 'openAi'},
        {id: 'openPlugins'},
    ]
}
