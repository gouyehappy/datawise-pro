import type {DwIconName} from '@/core/icons'
import type {ShortcutPanel} from '@/core/types'
import type {SideRailItemId} from '@/shared/config/side-rail.types'

/** Keep in sync with WelcomeExploreLinkId (avoid shared→features import). */
export type WorkbenchWelcomeExploreId =
    | 'connectors'
    | 'dashboard'
    | 'team'
    | 'ai'
    | 'settings'

/** B0: 工作台情境模式 — 裁剪默认导航，不卸能力 */
export type WorkbenchMode = 'query' | 'analyze' | 'govern' | 'ops'

export type ModeVisibility = 'primary' | 'secondary' | 'hidden'

export interface WorkbenchModeDef {
    id: WorkbenchMode
    labelKey: string
    hintKey: string
    icon: DwIconName
}

export const WORKBENCH_MODES: readonly WorkbenchModeDef[] = [
    {
        id: 'query',
        labelKey: 'nav.mode.query',
        hintKey: 'nav.mode.queryHint',
        icon: 'database',
    },
    {
        id: 'analyze',
        labelKey: 'nav.mode.analyze',
        hintKey: 'nav.mode.analyzeHint',
        icon: 'ai',
    },
    {
        id: 'govern',
        labelKey: 'nav.mode.govern',
        hintKey: 'nav.mode.governHint',
        icon: 'users',
    },
    {
        id: 'ops',
        labelKey: 'nav.mode.ops',
        hintKey: 'nav.mode.opsHint',
        icon: 'terminal',
    },
] as const

export const DEFAULT_WORKBENCH_MODE: WorkbenchMode = 'query'

export const WORKBENCH_MODE_IDS: readonly WorkbenchMode[] = WORKBENCH_MODES.map((item) => item.id)

export function isWorkbenchMode(value: unknown): value is WorkbenchMode {
    return typeof value === 'string' && (WORKBENCH_MODE_IDS as readonly string[]).includes(value)
}

export function normalizeWorkbenchMode(value: unknown): WorkbenchMode {
    return isWorkbenchMode(value) ? value : DEFAULT_WORKBENCH_MODE
}

/**
 * Side-rail visibility by mode.
 * primary/secondary → show; hidden → mode-filtered out (still in command palette / settings).
 */
const SIDE_RAIL_MODE_VISIBILITY: Record<SideRailItemId, Record<WorkbenchMode, ModeVisibility>> = {
    database: {query: 'primary', analyze: 'primary', govern: 'secondary', ops: 'primary'},
    dashboard: {query: 'secondary', analyze: 'primary', govern: 'hidden', ops: 'hidden'},
    ai: {query: 'secondary', analyze: 'primary', govern: 'secondary', ops: 'hidden'},
    packStore: {query: 'hidden', analyze: 'secondary', govern: 'secondary', ops: 'secondary'},
    plugin: {query: 'hidden', analyze: 'hidden', govern: 'hidden', ops: 'secondary'},
    connectorMarket: {query: 'secondary', analyze: 'hidden', govern: 'hidden', ops: 'primary'},
    pluginDev: {query: 'hidden', analyze: 'hidden', govern: 'hidden', ops: 'secondary'},
    communityPlugin: {query: 'secondary', analyze: 'hidden', govern: 'hidden', ops: 'secondary'},
    profile: {query: 'secondary', analyze: 'secondary', govern: 'secondary', ops: 'secondary'},
    team: {query: 'hidden', analyze: 'hidden', govern: 'primary', ops: 'hidden'},
    settings: {query: 'secondary', analyze: 'secondary', govern: 'secondary', ops: 'secondary'},
    refresh: {query: 'primary', analyze: 'primary', govern: 'primary', ops: 'primary'},
    notify: {query: 'primary', analyze: 'primary', govern: 'primary', ops: 'primary'},
    assistant: {query: 'secondary', analyze: 'primary', govern: 'secondary', ops: 'secondary'},
    feedback: {query: 'secondary', analyze: 'secondary', govern: 'secondary', ops: 'secondary'},
    terminal: {query: 'secondary', analyze: 'secondary', govern: 'secondary', ops: 'primary'},
}

const SHORTCUT_RAIL_MODE_VISIBILITY: Record<ShortcutPanel, Record<WorkbenchMode, ModeVisibility>> = {
    info: {query: 'primary', analyze: 'secondary', govern: 'primary', ops: 'primary'},
    history: {query: 'primary', analyze: 'secondary', govern: 'secondary', ops: 'secondary'},
    monitor: {query: 'secondary', analyze: 'hidden', govern: 'secondary', ops: 'primary'},
    console: {query: 'primary', analyze: 'secondary', govern: 'secondary', ops: 'secondary'},
    migration: {query: 'hidden', analyze: 'hidden', govern: 'secondary', ops: 'primary'},
    export: {query: 'secondary', analyze: 'hidden', govern: 'secondary', ops: 'primary'},
}

const WELCOME_EXPLORE_MODE_VISIBILITY: Record<
    WorkbenchWelcomeExploreId,
    Record<WorkbenchMode, ModeVisibility>
> = {
    connectors: {query: 'secondary', analyze: 'hidden', govern: 'hidden', ops: 'primary'},
    dashboard: {query: 'secondary', analyze: 'primary', govern: 'hidden', ops: 'hidden'},
    team: {query: 'hidden', analyze: 'hidden', govern: 'primary', ops: 'hidden'},
    ai: {query: 'secondary', analyze: 'primary', govern: 'secondary', ops: 'hidden'},
    settings: {query: 'secondary', analyze: 'secondary', govern: 'secondary', ops: 'secondary'},
}

/** Welcome 主路径 / 常用操作按焦点裁剪 */
export type WorkbenchWelcomeMainPathId = 'explore' | 'sql' | 'ai'
export type WorkbenchWelcomeCommonActionId =
    | 'newConnection'
    | 'newConsole'
    | 'history'
    | 'import'
    | 'localData'
    | 'ai'

const WELCOME_MAIN_PATH_MODE_VISIBILITY: Record<
    WorkbenchWelcomeMainPathId,
    Record<WorkbenchMode, ModeVisibility>
> = {
    explore: {query: 'primary', analyze: 'secondary', govern: 'hidden', ops: 'primary'},
    sql: {query: 'primary', analyze: 'secondary', govern: 'secondary', ops: 'secondary'},
    ai: {query: 'secondary', analyze: 'primary', govern: 'hidden', ops: 'hidden'},
}

const WELCOME_COMMON_ACTION_MODE_VISIBILITY: Record<
    WorkbenchWelcomeCommonActionId,
    Record<WorkbenchMode, ModeVisibility>
> = {
    newConnection: {query: 'primary', analyze: 'secondary', govern: 'hidden', ops: 'primary'},
    newConsole: {query: 'primary', analyze: 'secondary', govern: 'secondary', ops: 'secondary'},
    history: {query: 'primary', analyze: 'secondary', govern: 'secondary', ops: 'secondary'},
    import: {query: 'secondary', analyze: 'hidden', govern: 'hidden', ops: 'primary'},
    localData: {query: 'primary', analyze: 'secondary', govern: 'hidden', ops: 'secondary'},
    ai: {query: 'secondary', analyze: 'primary', govern: 'hidden', ops: 'hidden'},
}

function isVisible(level: ModeVisibility | undefined): boolean {
    return level === 'primary' || level === 'secondary'
}

export function isSideRailVisibleInMode(id: SideRailItemId, mode: WorkbenchMode): boolean {
    return isVisible(SIDE_RAIL_MODE_VISIBILITY[id]?.[mode])
}

export function isShortcutRailVisibleInMode(id: ShortcutPanel, mode: WorkbenchMode): boolean {
    return isVisible(SHORTCUT_RAIL_MODE_VISIBILITY[id]?.[mode])
}

export function isWelcomeExploreVisibleInMode(
    id: WorkbenchWelcomeExploreId,
    mode: WorkbenchMode,
): boolean {
    return isVisible(WELCOME_EXPLORE_MODE_VISIBILITY[id]?.[mode])
}

export function isWelcomeMainPathVisibleInMode(
    id: WorkbenchWelcomeMainPathId,
    mode: WorkbenchMode,
): boolean {
    return isVisible(WELCOME_MAIN_PATH_MODE_VISIBILITY[id]?.[mode])
}

export function isWelcomeCommonActionVisibleInMode(
    id: WorkbenchWelcomeCommonActionId,
    mode: WorkbenchMode,
): boolean {
    return isVisible(WELCOME_COMMON_ACTION_MODE_VISIBILITY[id]?.[mode])
}

/**
 * Soft-infer mode from nav module.
 * `database` returns null so query/ops can share the DB shell without flipping each other.
 */
export function inferWorkbenchModeFromModule(module: string): WorkbenchMode | null {
    if (module === 'ai' || module === 'dashboard') return 'analyze'
    if (module === 'team') return 'govern'
    if (module === 'connectorMarket' || module === 'plugin' || module === 'pluginDev') return 'ops'
    return null
}

/** Default module to open when the user switches mode. */
export function defaultModuleForWorkbenchMode(mode: WorkbenchMode): string {
    if (mode === 'analyze') return 'ai'
    if (mode === 'govern') return 'team'
    if (mode === 'ops') return 'database'
    return 'database'
}
