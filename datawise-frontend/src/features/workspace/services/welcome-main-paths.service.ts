import type {DwIconName} from '@/core/icons'
import type {DbType, TreeNode} from '@/core/types'
import {walkTree} from '@/core/utils/tree'
import {
    isWelcomeCommonActionVisibleInMode,
    isWelcomeExploreVisibleInMode,
    isWelcomeMainPathVisibleInMode,
    type WorkbenchMode,
} from '@/shared/config/workbench-mode'

/** Welcome 首屏开始项（探索 / 可治理 SQL / AI） */
export type WelcomeMainPathId = 'explore' | 'sql' | 'ai'

export interface WelcomeMainPathDef {
    id: WelcomeMainPathId
    titleKey: string
    descKey: string
    actionKey: string
    icon: DwIconName
}

export const WELCOME_MAIN_PATHS: readonly WelcomeMainPathDef[] = [
    {
        id: 'explore',
        titleKey: 'welcome.paths.exploreTitle',
        descKey: 'welcome.paths.exploreDesc',
        actionKey: 'welcome.paths.exploreAction',
        icon: 'database',
    },
    {
        id: 'sql',
        titleKey: 'welcome.paths.sqlTitle',
        descKey: 'welcome.paths.sqlDesc',
        actionKey: 'welcome.paths.sqlAction',
        icon: 'console',
    },
    {
        id: 'ai',
        titleKey: 'welcome.paths.aiTitle',
        descKey: 'welcome.paths.aiDesc',
        actionKey: 'welcome.paths.aiAction',
        icon: 'ai',
    },
] as const

/** 右侧常用操作（对齐常见 DB 客户端首页） */
export type WelcomeCommonActionId =
    | 'newConnection'
    | 'newConsole'
    | 'history'
    | 'import'
    | 'localData'
    | 'ai'

export interface WelcomeCommonActionDef {
    id: WelcomeCommonActionId
    titleKey: string
    icon: DwIconName
}

export const WELCOME_COMMON_ACTIONS: readonly WelcomeCommonActionDef[] = [
    {id: 'newConnection', titleKey: 'welcome.newConnection', icon: 'plus'},
    {id: 'newConsole', titleKey: 'welcome.newConsole', icon: 'console'},
    {id: 'history', titleKey: 'welcome.common.history', icon: 'history'},
    {id: 'import', titleKey: 'explorer.importConnections', icon: 'import'},
    {id: 'localData', titleKey: 'welcome.common.localData', icon: 'file'},
    {id: 'ai', titleKey: 'welcome.paths.aiAction', icon: 'ai'},
] as const

/** 首页「上手」三步 */
export type WelcomeWorkflowStepId = 'connect' | 'query' | 'analyze'

export interface WelcomeWorkflowStepDef {
    id: WelcomeWorkflowStepId
    titleKey: string
    descKey: string
    icon: DwIconName
}

export const WELCOME_WORKFLOW_STEPS: readonly WelcomeWorkflowStepDef[] = [
    {
        id: 'connect',
        titleKey: 'welcome.workflow.connectTitle',
        descKey: 'welcome.workflow.connectDesc',
        icon: 'database',
    },
    {
        id: 'query',
        titleKey: 'welcome.workflow.queryTitle',
        descKey: 'welcome.workflow.queryDesc',
        icon: 'console',
    },
    {
        id: 'analyze',
        titleKey: 'welcome.workflow.analyzeTitle',
        descKey: 'welcome.workflow.analyzeDesc',
        icon: 'ai',
    },
] as const

/** 首页能力入口（次级导航） */
export type WelcomeExploreLinkId =
    | 'connectors'
    | 'dashboard'
    | 'team'
    | 'settings'
    | 'ai'

export interface WelcomeExploreLinkDef {
    id: WelcomeExploreLinkId
    titleKey: string
    descKey: string
    icon: DwIconName
}

export const WELCOME_EXPLORE_LINKS: readonly WelcomeExploreLinkDef[] = [
    {
        id: 'connectors',
        titleKey: 'welcome.explore.connectorsTitle',
        descKey: 'welcome.explore.connectorsDesc',
        icon: 'connectors',
    },
    {
        id: 'dashboard',
        titleKey: 'welcome.explore.dashboardTitle',
        descKey: 'welcome.explore.dashboardDesc',
        icon: 'dashboard',
    },
    {
        id: 'team',
        titleKey: 'welcome.explore.teamTitle',
        descKey: 'welcome.explore.teamDesc',
        icon: 'users',
    },
    {
        id: 'ai',
        titleKey: 'welcome.explore.aiTitle',
        descKey: 'welcome.explore.aiDesc',
        icon: 'ai',
    },
    {
        id: 'settings',
        titleKey: 'welcome.explore.settingsTitle',
        descKey: 'welcome.explore.settingsDesc',
        icon: 'settings',
    },
] as const

/** 首页快捷键示意 */
export const WELCOME_SHORTCUT_HINTS = [
    {actionId: 'workspace.runSql' as const, labelKey: 'welcome.shortcuts.run'},
    {actionId: 'workspace.newConsole' as const, labelKey: 'welcome.shortcuts.newConsole'},
    {actionId: 'workspace.aiPrompt' as const, labelKey: 'welcome.shortcuts.ai'},
    {actionId: 'explorer.search' as const, labelKey: 'welcome.actions.search'},
] as const

export function filterWelcomeExploreLinks(options: {
    canConnectors: boolean
    canDashboard: boolean
    canTeam: boolean
    canSettings: boolean
    canAi: boolean
    /** B1: optional workbench mode filter */
    workbenchMode?: WorkbenchMode
}): WelcomeExploreLinkDef[] {
    return WELCOME_EXPLORE_LINKS.filter((link) => {
        if (options.workbenchMode && !isWelcomeExploreVisibleInMode(link.id, options.workbenchMode)) {
            return false
        }
        if (link.id === 'connectors') return options.canConnectors
        if (link.id === 'dashboard') return options.canDashboard
        if (link.id === 'team') return options.canTeam
        if (link.id === 'settings') return options.canSettings
        if (link.id === 'ai') return options.canAi
        return false
    })
}

export interface WelcomeConnectionRow {
    id: string
    label: string
    dbType: DbType
    env?: string
    meta?: string
    /** 社区插件连接：与侧栏 TreeNodeIcon 一致 */
    pluginId?: string
}

function pushWelcomeConnections(
    nodes: readonly TreeNode[],
    list: WelcomeConnectionRow[],
): void {
    for (const node of nodes) {
        if (node.type === 'connection' && node.dbType) {
            list.push({
                id: node.id,
                label: node.label,
                dbType: node.dbType,
                env: node.env,
                meta: node.meta,
                pluginId: node.pluginId,
            })
        }
        if (node.children?.length) {
            pushWelcomeConnections(node.children, list)
        }
    }
}

function listWelcomeConnections(tree: TreeNode[]): WelcomeConnectionRow[] {
    const ordered: WelcomeConnectionRow[] = []
    pushWelcomeConnections(tree, ordered)
    return ordered
}

function pickWelcomeConnections(
    ordered: readonly WelcomeConnectionRow[],
    preferredIds: readonly string[],
    limit: number,
    fallback: readonly WelcomeConnectionRow[],
): WelcomeConnectionRow[] {
    if (!ordered.length || limit <= 0) return []
    const byId = new Map(ordered.map((row) => [row.id, row]))
    const result: WelcomeConnectionRow[] = []
    const seen = new Set<string>()

    for (const id of preferredIds) {
        if (result.length >= limit) break
        const row = byId.get(id)
        if (!row || seen.has(id)) continue
        result.push(row)
        seen.add(id)
    }

    for (const row of fallback) {
        if (result.length >= limit) break
        if (seen.has(row.id)) continue
        result.push(row)
        seen.add(row.id)
    }

    return result
}

/**
 * 最近使用：优先 recentIds，不足时按树文档顺序补齐
 */
export function collectWelcomeConnections(
    tree: TreeNode[],
    limit = 8,
    recentIds: readonly string[] = [],
): WelcomeConnectionRow[] {
    const ordered = listWelcomeConnections(tree)
    return pickWelcomeConnections(ordered, recentIds, limit, ordered)
}

/**
 * 最新添加：优先 addedIds，不足时按树文档逆序补齐（靠近末尾的更像新加）
 */
export function collectWelcomeNewestConnections(
    tree: TreeNode[],
    limit = 8,
    addedIds: readonly string[] = [],
): WelcomeConnectionRow[] {
    const ordered = listWelcomeConnections(tree)
    return pickWelcomeConnections(ordered, addedIds, limit, [...ordered].reverse())
}

export function countWelcomeDbTypes(tree: TreeNode[]): number {
    const types = new Set<string>()
    walkTree(tree, (node) => {
        if (node.type === 'connection' && node.dbType) types.add(node.dbType)
    })
    return types.size
}

export function countWelcomeConnected(
    pooledIds: ReadonlySet<string> | Iterable<string>,
): number {
    if (pooledIds instanceof Set) return pooledIds.size
    return new Set(pooledIds).size
}

export function filterWelcomeMainPaths(options: {
    canCreateConnection: boolean
    canNewConsole: boolean
    canAi: boolean
    /** B1: optional workbench mode filter */
    workbenchMode?: WorkbenchMode
}): WelcomeMainPathDef[] {
    return WELCOME_MAIN_PATHS.filter((path) => {
        if (options.workbenchMode && !isWelcomeMainPathVisibleInMode(path.id, options.workbenchMode)) {
            return false
        }
        if (path.id === 'explore') return options.canCreateConnection
        if (path.id === 'sql') return options.canNewConsole
        if (path.id === 'ai') return options.canAi
        return false
    })
}

export function filterWelcomeCommonActions(options: {
    canCreateConnection: boolean
    canNewConsole: boolean
    canHistory: boolean
    canImport: boolean
    canAi: boolean
    /** B1: optional workbench mode filter */
    workbenchMode?: WorkbenchMode
}): WelcomeCommonActionDef[] {
    return WELCOME_COMMON_ACTIONS.filter((action) => {
        if (options.workbenchMode && !isWelcomeCommonActionVisibleInMode(action.id, options.workbenchMode)) {
            return false
        }
        if (action.id === 'newConnection') return options.canCreateConnection
        if (action.id === 'newConsole') return options.canNewConsole
        if (action.id === 'history') return options.canHistory
        if (action.id === 'import') return options.canImport
        if (action.id === 'ai') return options.canAi
        return false
    })
}

/** Empty workspace → explore first; returning users with connections → governed SQL. */
export function preferredWelcomePath(
    paths: readonly WelcomeMainPathDef[],
    hasConnections: boolean,
): WelcomeMainPathId | null {
    const ids = new Set(paths.map((path) => path.id))
    if (hasConnections && ids.has('sql')) return 'sql'
    if (!hasConnections && ids.has('explore')) return 'explore'
    return paths[0]?.id ?? null
}

export function leadCopyKey(hasConnections: boolean): 'welcome.leadReturning' | 'welcome.lead' {
    return hasConnections ? 'welcome.leadReturning' : 'welcome.lead'
}

export function summarizeSqlPreview(sql: string, maxLen = 72): string {
    const compact = sql.replace(/\s+/g, ' ').trim()
    if (compact.length <= maxLen) return compact
    return `${compact.slice(0, maxLen - 1)}…`
}
