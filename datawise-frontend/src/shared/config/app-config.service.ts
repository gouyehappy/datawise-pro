import type {NavModule, ShortcutPanel} from '@/core/types'
import {
    normalizeDockPlacement,
    normalizePanelFloat,
} from '@/shared/layout/dock.types'
import {
    EXPLORER_PANEL_RESIZE_MIN,
    SHORTCUT_PANEL_RESIZE_MIN,
    SIDE_PANEL_RESIZE_MAX_PX,
} from '@/core/composables/useSidePanelResizeBounds'
import type {AppLocale} from '@/i18n'
import {LOCALE_STORAGE_KEY} from '@/i18n'
import type {SideRailItemId} from '@/shared/config/side-rail.types'
import {SIDE_RAIL_NAV_DEFS} from '@/shared/config/side-rail-nav'
import {
    isValidAnalysisMode,
    normalizeAnalysisMode,
} from '@/shared/api/ai-analysis-mode'
import type {AiAnalysisConfigurableStepId} from '@/shared/api/ai.types'
import {SHORTCUT_DEFINITIONS} from '@/core/shortcuts/definitions'
import type {ShortcutPreferences} from '@/core/shortcuts/types'
import {SHORTCUT_RAIL_NAV_DEFS} from '@/shared/config/shortcut-rail-nav'
import {
    DEFAULT_EDITOR_SETTINGS,
    EDITOR_FONT_SIZE_MAX,
    EDITOR_FONT_SIZE_MIN,
    EDITOR_LINE_HEIGHT_MAX,
    EDITOR_LINE_HEIGHT_MIN,
    EDITOR_STORAGE_KEY,
    MAX_RESULT_ROWS_MIN,
    MAX_RESULT_ROWS_MAX,
} from '@/shared/config/editor-presets'
import {THEME_STORAGE_KEY} from '@/shared/config/theme-presets'
import {readStoredEditorSettings} from '@/shared/config/editor-settings-storage'
import {
    hydrateSqlEditorStorageFromAppConfigBody,
    readCanonicalSqlEditorLayers,
} from '@/shared/config/sql-editor-shortcuts.service'
import {sqlEditorShortcutsLayerHasOverrides} from '@datawise/sql-editor/config/snippets/layer-overrides'
import {
    normalizeThemePreferences,
    readThemePreferencesOnBoot,
} from '@/shared/config/theme-preferences-storage'
import {
    SQL_EDITOR_SHORTCUTS_SHARED_STORAGE_KEY,
    LEGACY_SQL_EDITOR_SHORTCUTS_STORAGE_KEY,
    SQL_EDITOR_SHORTCUTS_STORAGE_KEY
} from '@/shared/config/sql-editor-shortcuts-presets'
import {createId} from '@/core/utils/id'
import {
    APP_CONFIG_VERSION,
    type AppConfigFile,
    type AiAnalysisLlmRouteStep,
    type AiEmbeddingProfile,
    type AiEmbeddingSettings,
    type AiLlmProfile,
    type AiLlmSettings,
    type AiPgVectorPreferences,
    type AiPreferences,
    type AiRagPreferences,
    type AiVectorStorePreference,
    type ConnectionHealthPreferences,
    type ConnectionHealthProbeIntervalMinutes,
    type DangerousSqlPreferences,
    type ExplorerPreferences,
    type LayoutPreferences,
    type PluginPreferences,
    type RestorableNavModule,
    type WindowPreferences,
    type WorkspacePreferences,
    type WorkspaceSessionFile,
    type LocalFilesPreferences,
} from '@/shared/config/app-config.types'
import {
    createDefaultAppConfig,
    DEFAULT_AI_PREFERENCES,
    DEFAULT_AI_PGVECTOR_PREFERENCES,
    DEFAULT_AI_RAG_PREFERENCES,
    DEFAULT_CONNECTION_HEALTH_PREFERENCES,
    DEFAULT_DANGEROUS_SQL_PREFERENCES,
    DEFAULT_EXPLORER_PREFERENCES,
    DEFAULT_LAYOUT_PREFERENCES,
    DEFAULT_LOCAL_FILES_PREFERENCES,
    DEFAULT_PLUGIN_PREFERENCES,
    DEFAULT_SHORTCUT_PANEL_MAX_HEIGHT,
    DEFAULT_SHORTCUT_PANEL_WIDTH,
    DEFAULT_WINDOW,
    DEFAULT_WORKSPACE_PREFERENCES,
    DEFAULT_WORKSPACE_SESSION,
} from '@/shared/config/app-config.defaults'
import {normalizeDashboardPreferences} from '@/shared/config/dashboard-preferences'
import {
    AI_DEFAULT_LLM_ID,
    AI_DEFAULT_EMBEDDING_ID,
    AI_DEFAULT_COMPLETIONS_PATH,
    DEFAULT_AI_EMBEDDING_SETTINGS,
    DEFAULT_AI_LLM_SETTINGS,
    AI_DEFAULT_EMBEDDINGS_PATH,
    isAiEmbeddingProviderId,
    isAiProviderId,
    AI_EMBEDDING_DIMENSIONS_MAX,
    AI_EMBEDDING_DIMENSIONS_MIN,
    AI_MAX_TOKENS_MAX,
    AI_MAX_TOKENS_MIN,
    AI_TEMPERATURE_MAX,
    AI_TEMPERATURE_MIN,
} from '@/shared/config/ai-presets'
import {CONSOLE_EDITOR_HEIGHT_MAX, CONSOLE_EDITOR_HEIGHT_MIN} from '@/shared/config/console-layout.defaults'
import {
    createEmptySqlEditorShortcutsLayer,
    normalizeSqlEditorShortcutsLayer,
} from '@datawise/sql-editor/config/snippets'
import type {SqlEditorShortcutsLayer} from '@datawise/sql-editor/types'
import {
    parseAppConfigXml,
    serializeAppConfigXml,
} from '@/shared/config/app-config-xml'
import {APP_CONFIG_KEY, resolveAppConfigStorageKey} from '@/shared/config/app-config-storage-scope'
import {UserResource} from '@/shared/auth/user-resource.types'
import {canPersistLocalResource, canReadResource} from '@/shared/auth/user-resource-policy'
import {
    setServerConfigSyncEnabled,
    shouldSyncConfigToServer,
} from '@/shared/config/config-server-sync'
import {isQuietBackgroundSyncFailure} from '@/shared/api/http/session-guard'
import {cancelPendingSqlSnippetServerPersists} from '@/shared/config/sql-editor-shortcuts.service'
import {shouldUseBuiltinAppConfig} from '@/shared/config/app-config-read-policy'
import {
    HOME_NAV_MODULE,
    pickAccessibleNavModule,
    resolveHomeNavModule,
    isSideRailItemVisible as isSideRailItemVisibleFromPrefs,
} from '@/shared/config/home-nav.module'

export {setServerConfigSyncEnabled} from '@/shared/config/config-server-sync'
export {HOME_NAV_MODULE, resolveHomeNavModule, pickAccessibleNavModule} from '@/shared/config/home-nav.module'

export {APP_CONFIG_KEY, resolveAppConfigStorageKey, setAppConfigStorageScope} from '@/shared/config/app-config-storage-scope'
export {shouldUseBuiltinAppConfig} from '@/shared/config/app-config-read-policy'

async function loadConfigApi() {
    const {createHttpConfigApi} = await import('@/shared/api/http/config')
    return createHttpConfigApi()
}

/** @deprecated 迁移用，新配置统一写入 config/app.xml（经后端 API） */
export const LEGACY_LAYOUT_CONFIG_KEY = 'dw-layout-config'
export const APP_CONFIG_FILENAME = 'datawise-config.xml'

const RESTORABLE_MODULES: RestorableNavModule[] = ['database', 'dashboard', 'ai', 'packStore', 'plugin', 'pluginDev', 'connectorMarket', 'communityPlugin']

const SIDE_RAIL_IDS = new Set<SideRailItemId>(SIDE_RAIL_NAV_DEFS.map((item) => item.id))
const SHORTCUT_IDS = new Set<ShortcutPanel>(SHORTCUT_RAIL_NAV_DEFS.map((item) => item.id))

let persistTimer: ReturnType<typeof setTimeout> | null = null
let serverPersistTimer: ReturnType<typeof setTimeout> | null = null
/** Latest payload wins — avoid writing a stale config captured before a later toggle. */
let pendingPersistConfig: AppConfigFile | null = null
let pendingServerPersistConfig: AppConfigFile | null = null

/** 取消尚未执行的 app.xml / snippets debounce 写入（登录切换、退出时调用）。 */
export function cancelDeferredConfigServerWrites(): void {
    cancelPendingAppConfigPersists()
    cancelPendingSqlSnippetServerPersists()
}

/** 取消尚未执行的本地/服务端 app 配置持久化。 */
export function cancelPendingAppConfigPersists(): void {
    if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
    }
    if (serverPersistTimer) {
        clearTimeout(serverPersistTimer)
        serverPersistTimer = null
    }
    pendingPersistConfig = null
    pendingServerPersistConfig = null
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
    const num = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(num)) return fallback
    return Math.min(max, Math.max(min, num))
}

function readLocale(): AppLocale | undefined {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return stored === 'en-US' ? 'en-US' : stored === 'zh-CN' ? 'zh-CN' : undefined
}

function mergeVisibility<T extends string>(
    partial: Partial<Record<T, boolean>> | undefined,
    ids: readonly T[],
    fallback: Partial<Record<T, boolean>>,
): Record<T, boolean> {
    const result = {} as Record<T, boolean>
    for (const id of ids) {
        result[id] = partial?.[id] ?? fallback[id] !== false
    }
    return result
}

export function normalizeLayout(raw: Partial<LayoutPreferences> | undefined): LayoutPreferences {
    const base = DEFAULT_LAYOUT_PREFERENCES
    const lastModuleRaw = RESTORABLE_MODULES.includes(raw?.lastModule as RestorableNavModule)
        ? (raw!.lastModule as RestorableNavModule)
        : base.lastModule
    const lastModule = resolveHomeNavModule(lastModuleRaw)
    const lastShortcutPanel = SHORTCUT_IDS.has(raw?.lastShortcutPanel as ShortcutPanel)
        ? (raw!.lastShortcutPanel as ShortcutPanel)
        : base.lastShortcutPanel

    return {
        sideRailVisibility: mergeVisibility(
            raw?.sideRailVisibility,
            SIDE_RAIL_NAV_DEFS.map((item) => item.id),
            base.sideRailVisibility,
        ),
        shortcutRailVisibility: mergeVisibility(
            raw?.shortcutRailVisibility,
            SHORTCUT_RAIL_NAV_DEFS.map((item) => item.id),
            base.shortcutRailVisibility,
        ),
        showSideRailStrip: raw?.showSideRailStrip ?? base.showSideRailStrip,
        showShortcutRailStrip: raw?.showShortcutRailStrip ?? base.showShortcutRailStrip,
        showExplorerPanel: raw?.showExplorerPanel ?? base.showExplorerPanel,
        // Align with live ResizeHandle bounds (useSidePanelResizeBounds).
        explorerWidth: clamp(
            raw?.explorerWidth,
            base.explorerWidth,
            EXPLORER_PANEL_RESIZE_MIN,
            SIDE_PANEL_RESIZE_MAX_PX,
        ),
        shortcutPanelWidth: clamp(
            raw?.shortcutPanelWidth,
            base.shortcutPanelWidth,
            SHORTCUT_PANEL_RESIZE_MIN,
            SIDE_PANEL_RESIZE_MAX_PX,
        ),
        shortcutPanelMaxHeight: clamp(
            raw?.shortcutPanelMaxHeight,
            base.shortcutPanelMaxHeight,
            280,
            560,
        ),
        showTerminalPanel: raw?.showTerminalPanel ?? base.showTerminalPanel,
        terminalHeight: clamp(raw?.terminalHeight, base.terminalHeight, 160, 520),
        lastModule,
        lastShortcutPanel,
        openHttpLinksIn: raw?.openHttpLinksIn === 'system' ? 'system' : 'builtin',
        dockPlacement: raw?.dockPlacement == null
            ? (base.dockPlacement ?? null)
            : normalizeDockPlacement(raw.dockPlacement),
        dockTerminalFloat: raw?.dockTerminalFloat == null
            ? (base.dockTerminalFloat ?? null)
            : normalizePanelFloat('terminal', raw.dockTerminalFloat),
        dockExplorerFloat: raw?.dockExplorerFloat == null
            ? (base.dockExplorerFloat ?? null)
            : normalizePanelFloat('explorer', raw.dockExplorerFloat),
        dockShortcutFloat: raw?.dockShortcutFloat == null
            ? (base.dockShortcutFloat ?? null)
            : normalizePanelFloat('shortcut', raw.dockShortcutFloat),
        dockWorkspaceFloat: raw?.dockWorkspaceFloat == null
            ? (base.dockWorkspaceFloat ?? null)
            : normalizePanelFloat('workspace', raw.dockWorkspaceFloat),
    }
}

export function normalizeShortcuts(raw: Partial<ShortcutPreferences> | undefined): ShortcutPreferences {
    const prefs: ShortcutPreferences = {}
    for (const def of SHORTCUT_DEFINITIONS) {
        const value = raw?.[def.id]
        const trimmed = typeof value === 'string' ? value.trim() : ''
        prefs[def.id] = trimmed || def.defaultBinding
    }
    return prefs
}

export function normalizeExplorer(raw: Partial<ExplorerPreferences> | undefined): ExplorerPreferences {
    const base = DEFAULT_EXPLORER_PREFERENCES
    return {
        selectedNodeId: typeof raw?.selectedNodeId === 'string' ? raw.selectedNodeId : base.selectedNodeId,
        searchQuery: typeof raw?.searchQuery === 'string' ? raw.searchQuery : base.searchQuery,
        expandedNodeIds: Array.isArray(raw?.expandedNodeIds)
            ? raw!.expandedNodeIds.filter((id) => typeof id === 'string')
            : base.expandedNodeIds,
        pinnedNodeIds: Array.isArray(raw?.pinnedNodeIds)
            ? [...new Set(raw!.pinnedNodeIds.filter((id) => typeof id === 'string' && id.trim()))]
            : base.pinnedNodeIds,
        showColumnComment: raw?.showColumnComment ?? base.showColumnComment,
        showTableComment: raw?.showTableComment ?? base.showTableComment,
        showSemanticLayer: raw?.showSemanticLayer ?? base.showSemanticLayer,
    }
}

export function normalizeWorkspace(raw: Partial<WorkspacePreferences> | undefined): WorkspacePreferences {
    const base = DEFAULT_WORKSPACE_PREFERENCES
    return {
        consoleEditorHeight: clamp(
            raw?.consoleEditorHeight,
            base.consoleEditorHeight,
            CONSOLE_EDITOR_HEIGHT_MIN,
            CONSOLE_EDITOR_HEIGHT_MAX,
        ),
        showConsoleResultPanel: raw?.showConsoleResultPanel ?? base.showConsoleResultPanel,
        restoreSession: raw?.restoreSession ?? base.restoreSession,
    }
}

export function normalizeWorkspaceSession(raw: Partial<WorkspaceSessionFile> | null | undefined): WorkspaceSessionFile {
    const base = DEFAULT_WORKSPACE_SESSION
    return {
        tabs: Array.isArray(raw?.tabs) ? raw!.tabs : base.tabs,
        activeTabIndex: clamp(raw?.activeTabIndex, base.activeTabIndex, 0, 999),
        tabGroups: Array.isArray(raw?.tabGroups) ? raw!.tabGroups : base.tabGroups,
    }
}

/**
 * app.xml / PUT /api/config/app payload: summary prefs only.
 * Heavy detail lives in dedicated JSON files (ai / explorer-ui / window / local-files / workspace-session).
 * SQL editor shortcuts use sql-snippets APIs.
 */
export function toAppConfigSummary(config: AppConfigFile): AppConfigFile {
    const normalized = normalizeAppConfig(config)
    const workspace = normalized.workspace ?? {
        restoreSession: true,
        consoleEditorHeight: 400,
        showConsoleResultPanel: false,
    }
    return {
        ...normalized,
        workspace: {
            restoreSession: workspace.restoreSession ?? true,
            consoleEditorHeight: workspace.consoleEditorHeight ?? 400,
            showConsoleResultPanel: false,
        },
        ai: undefined,
        explorer: undefined,
        window: undefined,
        localFiles: undefined,
        sqlEditorShortcutsShared: undefined,
        sqlEditorShortcuts: undefined,
    }
}

function normalizePathList(raw: unknown, max: number): string[] {
    if (!Array.isArray(raw)) return []
    return raw
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, max)
}

export function normalizeLocalFiles(raw: Partial<LocalFilesPreferences> | undefined): LocalFilesPreferences {
    const base = DEFAULT_LOCAL_FILES_PREFERENCES
    const recentRoots = normalizePathList(raw?.recentRoots, 5)
    const favoriteRoots = normalizePathList(raw?.favoriteRoots, 10)
    const lastRoot = typeof raw?.lastRoot === 'string' && raw.lastRoot.trim()
        ? raw.lastRoot.trim()
        : (recentRoots[0] ?? base.lastRoot)
    return {
        lastRoot,
        recentRoots,
        favoriteRoots,
    }
}

export function normalizeAiLlm(raw: Partial<AiLlmSettings> | undefined): AiLlmSettings {
    const base = DEFAULT_AI_LLM_SETTINGS
    const provider = isAiProviderId(raw?.provider) ? raw.provider : base.provider
    return {
        provider,
        baseUrl: typeof raw?.baseUrl === 'string' && raw.baseUrl.trim()
            ? raw.baseUrl.trim().replace(/\/+$/, '')
            : base.baseUrl,
        apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey : base.apiKey,
        apiKeyConfigured: raw?.apiKeyConfigured === true
            || (typeof raw?.apiKey === 'string' && raw.apiKey.trim().length > 0),
        model: typeof raw?.model === 'string' && raw.model.trim() ? raw.model.trim() : base.model,
        temperature: clamp(raw?.temperature, base.temperature, AI_TEMPERATURE_MIN, AI_TEMPERATURE_MAX),
        maxTokens: clamp(raw?.maxTokens, base.maxTokens, AI_MAX_TOKENS_MIN, AI_MAX_TOKENS_MAX),
        completionsPath: normalizeApiPath(raw?.completionsPath, base.completionsPath ?? AI_DEFAULT_COMPLETIONS_PATH),
    }
}

function normalizeApiPath(raw: unknown, fallback: string): string {
    if (typeof raw !== 'string' || !raw.trim()) return fallback
    const trimmed = raw.trim()
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function normalizeAiLlmProfile(
    raw: Partial<AiLlmProfile> | undefined,
    fallbackName: string,
    fallbackId?: string,
): AiLlmProfile {
    const settings = normalizeAiLlm(raw)
    const id = typeof raw?.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : fallbackId ?? createId('llm')
    const name = typeof raw?.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : fallbackName
    return {id, name, ...settings}
}

export function normalizeAiEmbedding(raw: Partial<AiEmbeddingSettings> | undefined): AiEmbeddingSettings {
    const base = DEFAULT_AI_EMBEDDING_SETTINGS
    const provider = isAiEmbeddingProviderId(raw?.provider) ? raw.provider : base.provider
    const dimensionsRaw = raw?.dimensions
    let dimensions: number | null = null
    if (typeof dimensionsRaw === 'number' && Number.isFinite(dimensionsRaw)) {
        dimensions = clamp(
            dimensionsRaw,
            AI_EMBEDDING_DIMENSIONS_MIN,
            AI_EMBEDDING_DIMENSIONS_MIN,
            AI_EMBEDDING_DIMENSIONS_MAX,
        )
    }
    return {
        provider,
        baseUrl: typeof raw?.baseUrl === 'string' && raw.baseUrl.trim()
            ? raw.baseUrl.trim().replace(/\/+$/, '')
            : base.baseUrl,
        apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey : base.apiKey,
        apiKeyConfigured: raw?.apiKeyConfigured === true
            || (typeof raw?.apiKey === 'string' && raw.apiKey.trim().length > 0),
        model: typeof raw?.model === 'string' && raw.model.trim() ? raw.model.trim() : base.model,
        dimensions,
        embeddingsPath: normalizeApiPath(raw?.embeddingsPath, base.embeddingsPath ?? AI_DEFAULT_EMBEDDINGS_PATH),
        useChatConnection: raw?.useChatConnection === true,
    }
}

export function normalizeAiEmbeddingProfile(
    raw: Partial<AiEmbeddingProfile> | undefined,
    fallbackName: string,
    fallbackId?: string,
): AiEmbeddingProfile {
    const settings = normalizeAiEmbedding(raw)
    const id = typeof raw?.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : fallbackId ?? createId('emb')
    const name = typeof raw?.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : fallbackName
    return {id, name, ...settings}
}

const AI_LLM_ROUTE_STEPS: AiAnalysisLlmRouteStep[] = ['planning', 'sql', 'python', 'summary']

function normalizeAnalysisStepLlmIds(
    raw: Partial<Record<AiAnalysisLlmRouteStep, string>> | undefined,
    profiles: AiLlmProfile[],
): Partial<Record<AiAnalysisLlmRouteStep, string>> | undefined {
    if (!raw || typeof raw !== 'object') return undefined
    const result: Partial<Record<AiAnalysisLlmRouteStep, string>> = {}
    for (const step of AI_LLM_ROUTE_STEPS) {
        const profileId = raw[step]
        if (typeof profileId === 'string' && profileId.trim() && profiles.some((profile) => profile.id === profileId)) {
            result[step] = profileId
        }
    }
    return Object.keys(result).length ? result : undefined
}

const AI_VECTOR_STORE_VALUES = ['none', 'memory', 'pgvector'] as const

function normalizeAiPgVector(raw: Partial<AiPgVectorPreferences> | undefined): AiPgVectorPreferences {
    const base = DEFAULT_AI_PGVECTOR_PREFERENCES
    return {
        jdbcUrl: typeof raw?.jdbcUrl === 'string' ? raw.jdbcUrl.trim() : base.jdbcUrl,
        username: typeof raw?.username === 'string' ? raw.username.trim() : base.username,
        password: typeof raw?.password === 'string' ? raw.password : base.password,
        table: typeof raw?.table === 'string' && raw.table.trim()
            ? raw.table.trim()
            : base.table,
    }
}

function normalizeAiRag(raw: Partial<AiRagPreferences> | undefined): AiRagPreferences {
    const base = DEFAULT_AI_RAG_PREFERENCES
    const vectorStoreRaw = typeof raw?.vectorStore === 'string' ? raw.vectorStore.trim() : ''
    const vectorStore: AiVectorStorePreference = vectorStoreRaw === ''
        ? ''
        : AI_VECTOR_STORE_VALUES.includes(vectorStoreRaw as typeof AI_VECTOR_STORE_VALUES[number])
            ? vectorStoreRaw as AiVectorStorePreference
            : base.vectorStore
    return {
        vectorStore,
        pgvector: normalizeAiPgVector(raw?.pgvector),
    }
}

export function normalizeAi(raw: Partial<AiPreferences> | undefined): AiPreferences {
    const base = DEFAULT_AI_PREFERENCES
    let sideActivePanel = base.sideActivePanel
    if (raw?.sideActivePanel === 'history' || raw?.sideActivePanel === 'scope') {
        sideActivePanel = raw.sideActivePanel
    } else {
        const legacy = raw as { sideHistoryCollapsed?: boolean; sideScopeCollapsed?: boolean } | undefined
        const historyCollapsed = legacy?.sideHistoryCollapsed === true
        const scopeCollapsed = legacy?.sideScopeCollapsed === true
        if (historyCollapsed && !scopeCollapsed) sideActivePanel = 'scope'
        else if (!historyCollapsed && scopeCollapsed) sideActivePanel = 'history'
    }

    let profiles: AiLlmProfile[]
    if (Array.isArray(raw?.llmProfiles) && raw.llmProfiles.length > 0) {
        profiles = raw.llmProfiles.map((profile, index) =>
            normalizeAiLlmProfile(profile, `Model ${index + 1}`),
        )
    } else {
        const legacyLlm = (raw as { llm?: Partial<AiLlmSettings> } | undefined)?.llm
        if (legacyLlm) {
            profiles = [
                normalizeAiLlmProfile(
                    {...legacyLlm, id: AI_DEFAULT_LLM_ID, name: 'Default'},
                    'Default',
                    AI_DEFAULT_LLM_ID,
                ),
            ]
        } else {
            profiles = base.llmProfiles.map((profile) => ({...profile}))
        }
    }

    const rawDefaultId = typeof raw?.defaultLlmId === 'string' ? raw.defaultLlmId : ''
    const defaultLlmId = profiles.some((profile) => profile.id === rawDefaultId)
        ? rawDefaultId
        : profiles[0]?.id ?? ''

    const rawWorkbenchId = typeof raw?.workbenchLlmId === 'string' ? raw.workbenchLlmId : ''
    const workbenchLlmId = profiles.some((profile) => profile.id === rawWorkbenchId)
        ? rawWorkbenchId
        : defaultLlmId

    let embeddingProfiles: AiEmbeddingProfile[]
    if (Array.isArray(raw?.embeddingProfiles) && raw.embeddingProfiles.length > 0) {
        embeddingProfiles = raw.embeddingProfiles.map((profile, index) =>
            normalizeAiEmbeddingProfile(profile, `Embedding ${index + 1}`),
        )
    } else {
        const legacyEmbedding = (raw as { embedding?: Partial<AiEmbeddingSettings> } | undefined)?.embedding
        if (legacyEmbedding) {
            embeddingProfiles = [
                normalizeAiEmbeddingProfile(
                    {...legacyEmbedding, id: AI_DEFAULT_EMBEDDING_ID, name: 'Default'},
                    'Default',
                    AI_DEFAULT_EMBEDDING_ID,
                ),
            ]
        } else {
            embeddingProfiles = base.embeddingProfiles.map((profile) => ({...profile}))
        }
    }

    const rawDefaultEmbeddingId = typeof raw?.defaultEmbeddingId === 'string' ? raw.defaultEmbeddingId : ''
    const defaultEmbeddingId = embeddingProfiles.some((profile) => profile.id === rawDefaultEmbeddingId)
        ? rawDefaultEmbeddingId
        : embeddingProfiles[0]?.id ?? ''

    return {
        sideActivePanel,
        defaultLlmId,
        workbenchLlmId,
        llmProfiles: profiles,
        analysisStepLlmIds: normalizeAnalysisStepLlmIds(raw?.analysisStepLlmIds, profiles),
        skipSqlConfirmation: raw?.skipSqlConfirmation === true,
        disabledAnalysisSteps: Array.isArray(raw?.disabledAnalysisSteps)
            ? raw.disabledAnalysisSteps.filter(
                (step): step is AiAnalysisConfigurableStepId =>
                    typeof step === 'string'
                    && (['planner', 'evidence', 'sql_validate', 'python', 'chart', 'summary', 'report'] as const).includes(
                        step as AiAnalysisConfigurableStepId,
                    ),
            )
            : base.disabledAnalysisSteps ?? [],
        analysisMode: isValidAnalysisMode(raw?.analysisMode)
            ? raw.analysisMode
            : normalizeAnalysisMode(base.analysisMode),
        assistantHistoryLimit: clamp(
            raw?.assistantHistoryLimit,
            base.assistantHistoryLimit ?? 10,
            1,
            50,
        ),
        defaultEmbeddingId,
        embeddingProfiles,
        rag: normalizeAiRag(raw?.rag),
    }
}

export function normalizeWindow(raw: Partial<WindowPreferences> | undefined): WindowPreferences {
    const base = DEFAULT_WINDOW
    const normalizeCoordinate = (value: unknown): number | null =>
        typeof value === 'number' && Number.isFinite(value) ? value : null
    return {
        width: clamp(raw?.width, base.width, 900, 3840),
        height: clamp(raw?.height, base.height, 600, 2160),
        x: normalizeCoordinate(raw?.x),
        y: normalizeCoordinate(raw?.y),
        maximized: raw?.maximized ?? base.maximized,
    }
}

type AppConfigInput = Omit<Partial<AppConfigFile>, 'layout'> & {
    layout?: Partial<LayoutPreferences>
}

function normalizePlugins(raw: PluginPreferences | undefined): PluginPreferences {
    const enabled: PluginPreferences['enabled'] = {}
    if (raw?.enabled && typeof raw.enabled === 'object') {
        for (const [id, value] of Object.entries(raw.enabled)) {
            if (typeof value === 'boolean') enabled[id] = value
        }
    }
    const presetIds = ['dba', 'readOnlyAnalysis', 'teamViewer', 'developer', 'minimal'] as const
    const referencePresetId =
        typeof raw?.referencePresetId === 'string'
        && (presetIds as readonly string[]).includes(raw.referencePresetId)
            ? raw.referencePresetId
            : undefined
    return referencePresetId ? {enabled, referencePresetId} : {enabled}
}

const PROBE_INTERVALS: ConnectionHealthProbeIntervalMinutes[] = [1, 5, 15, 30]

function normalizeConnectionHealth(
    raw: Partial<ConnectionHealthPreferences> | undefined,
): ConnectionHealthPreferences {
    const base = DEFAULT_CONNECTION_HEALTH_PREFERENCES
    const watched = Array.isArray(raw?.watchedConnectionIds)
        ? raw.watchedConnectionIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : base.watchedConnectionIds
    const interval = PROBE_INTERVALS.includes(raw?.probeIntervalMinutes as ConnectionHealthProbeIntervalMinutes)
        ? (raw!.probeIntervalMinutes as ConnectionHealthProbeIntervalMinutes)
        : base.probeIntervalMinutes
    return {
        alertsEnabled: raw?.alertsEnabled ?? base.alertsEnabled,
        drawerAlertsEnabled: raw?.drawerAlertsEnabled ?? base.drawerAlertsEnabled,
        slowQueryAlertsEnabled: raw?.slowQueryAlertsEnabled ?? base.slowQueryAlertsEnabled,
        probeIntervalMinutes: interval,
        alertOnOkToError: raw?.alertOnOkToError ?? base.alertOnOkToError,
        alertOnUnknownToError: raw?.alertOnUnknownToError ?? base.alertOnUnknownToError,
        watchedConnectionIds: watched,
    }
}

function normalizeDangerousSql(
    raw: Partial<DangerousSqlPreferences> | undefined,
): DangerousSqlPreferences {
    const base = DEFAULT_DANGEROUS_SQL_PREFERENCES
    const whitelistedTables = Array.isArray(raw?.whitelistedTables)
        ? raw.whitelistedTables
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        : base.whitelistedTables
    return {
        confirmEnabled: raw?.confirmEnabled ?? base.confirmEnabled,
        whitelistedTables,
    }
}

export function normalizeAppConfig(raw: AppConfigInput | undefined): AppConfigFile {
    const defaults = createDefaultAppConfig()
    if (!raw) return defaults
    return {
        version: APP_CONFIG_VERSION,
        exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : defaults.exportedAt,
        locale: raw.locale === 'en-US' || raw.locale === 'zh-CN' ? raw.locale : readLocale(),
        theme: normalizeThemePreferences(raw.theme ?? readThemePreferencesOnBoot()),
        editor: raw.editor ?? readStoredEditorSettings(),
        window: normalizeWindow(raw.window),
        layout: normalizeLayout(raw.layout),
        explorer: normalizeExplorer(raw.explorer),
        workspace: normalizeWorkspace(raw.workspace),
        localFiles: normalizeLocalFiles(raw.localFiles),
        profile: raw.profile,
        ai: normalizeAi(raw.ai),
        plugins: normalizePlugins(raw.plugins ?? defaults.plugins),
        connectionHealth: normalizeConnectionHealth(raw.connectionHealth ?? defaults.connectionHealth),
        dangerousSql: normalizeDangerousSql(raw.dangerousSql ?? defaults.dangerousSql),
        dashboard: normalizeDashboardPreferences(raw.dashboard ?? defaults.dashboard),
        shortcuts: normalizeShortcuts(raw.shortcuts),
        // 导入/导出信封字段；本地运行时以专用 localStorage key 为准（见 attachCanonicalSqlEditorLayers）
        sqlEditorShortcutsShared: normalizeSqlEditorShortcutsLayer(raw.sqlEditorShortcutsShared),
        sqlEditorShortcuts: normalizeSqlEditorShortcutsLayer(raw.sqlEditorShortcuts),
    }
}

/** 本地运行时：sql-editor 层始终来自专用 key，而非 dw-app-config 内嵌副本 */
function attachCanonicalSqlEditorLayers(config: AppConfigFile): AppConfigFile {
    const {personal, shared} = readCanonicalSqlEditorLayers()
    return {
        ...config,
        sqlEditorShortcutsShared: shared,
        sqlEditorShortcuts: personal,
    }
}

/** 在 sql-editor store 初始化前调用，将 app-config 内嵌层一次性迁入专用 key */
export function bootstrapSqlEditorLayersFromStoredAppConfig(): void {
    try {
        const raw = localStorage.getItem(resolveAppConfigStorageKey())
        if (!raw) return
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const version = parsed.version
        if (version !== 1 && version !== 2) return
        hydrateSqlEditorStorageFromAppConfigBody(parsed as Partial<AppConfigFile>)
    } catch {
        /* ignore */
    }
}

function readLegacyLayoutOnly(): Partial<LayoutPreferences> | undefined {
    try {
        const raw = localStorage.getItem(LEGACY_LAYOUT_CONFIG_KEY)
        if (!raw) return undefined
        return JSON.parse(raw) as Partial<LayoutPreferences>
    } catch {
        return undefined
    }
}

export function readAppConfig(): AppConfigFile {
    if (shouldUseBuiltinAppConfig()) {
        // 访客/未登录：AI/布局等用内置默认；主题与编辑器仍走本机 last-write（guestRead）。
        return attachCanonicalSqlEditorLayers(normalizeAppConfig(createDefaultAppConfig()))
    }
    try {
        const raw = localStorage.getItem(resolveAppConfigStorageKey())
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<AppConfigFile>
            if (parsed.version === 2 || parsed.version === 1) {
                hydrateSqlEditorStorageFromAppConfigBody(parsed)
                return attachCanonicalSqlEditorLayers(normalizeAppConfig(parsed))
            }
        }
    } catch {
        /* fall through to legacy merge */
    }

    const legacyLayout = readLegacyLayoutOnly()
    return attachCanonicalSqlEditorLayers(
        normalizeAppConfig({
            version: APP_CONFIG_VERSION,
            exportedAt: new Date().toISOString(),
            locale: readLocale(),
            theme: readThemePreferencesOnBoot(),
            editor: readStoredEditorSettings(),
            layout: legacyLayout,
            window: DEFAULT_WINDOW,
            explorer: DEFAULT_EXPLORER_PREFERENCES,
            workspace: DEFAULT_WORKSPACE_PREFERENCES,
            localFiles: DEFAULT_LOCAL_FILES_PREFERENCES,
            ai: DEFAULT_AI_PREFERENCES,
        }),
    )
}

export function persistAppConfig(config: AppConfigFile, options?: {immediateServer?: boolean}) {
    if (canPersistLocalResource(UserResource.AppConfig)) {
        localStorage.setItem(resolveAppConfigStorageKey(), JSON.stringify(normalizeAppConfig(config)))
        localStorage.removeItem(LEGACY_LAYOUT_CONFIG_KEY)
    }
    if (options?.immediateServer) {
        flushAppConfigToServerNow(config)
        return
    }
    schedulePersistAppConfigToServer(config)
}

export function schedulePersistAppConfigToServer(config: AppConfigFile) {
    if (!shouldSyncConfigToServer()) return
    pendingServerPersistConfig = config
    if (serverPersistTimer) clearTimeout(serverPersistTimer)
    serverPersistTimer = setTimeout(() => {
        serverPersistTimer = null
        const next = pendingServerPersistConfig
        pendingServerPersistConfig = null
        if (!next || !shouldSyncConfigToServer()) return
        void loadConfigApi()
            .then((configApi) => configApi.saveAppConfig(toAppConfigSummary(next)))
            .catch((error) => {
            if (isQuietBackgroundSyncFailure(error)) return
            console.warn('[config] failed to persist app.xml', error)
        })
    }, 420)
}

/** Exit / unload: cancel debounce and POST app.xml immediately (best-effort). */
export function flushAppConfigToServerNow(config: AppConfigFile) {
    if (!shouldSyncConfigToServer()) return
    if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
    }
    pendingPersistConfig = null
    if (serverPersistTimer) {
        clearTimeout(serverPersistTimer)
        serverPersistTimer = null
    }
    pendingServerPersistConfig = null
    void loadConfigApi()
        .then((configApi) => configApi.saveAppConfig(toAppConfigSummary(config)))
        .catch((error) => {
            if (isQuietBackgroundSyncFailure(error)) return
            console.warn('[config] failed to persist app.xml', error)
        })
}

export async function fetchAppConfigFromServer(): Promise<AppConfigFile | null> {
    try {
        const configApi = await loadConfigApi()
        const remote = await configApi.fetchAppConfig()
        return remote ? normalizeAppConfig(remote) : null
    } catch {
        return null
    }
}

export async function fetchWorkspaceSessionFromServer(): Promise<WorkspaceSessionFile | null> {
    try {
        const configApi = await loadConfigApi()
        const remote = await configApi.fetchWorkspaceSession()
        return remote ? normalizeWorkspaceSession(remote) : null
    } catch {
        return null
    }
}

export async function fetchAiPreferencesFromServer(): Promise<AiPreferences | null> {
    try {
        const configApi = await loadConfigApi()
        const remote = await configApi.fetchAiPreferences()
        return remote ? normalizeAi(remote) : null
    } catch {
        return null
    }
}

export async function fetchExplorerUiFromServer(): Promise<ExplorerPreferences | null> {
    try {
        const configApi = await loadConfigApi()
        const remote = await configApi.fetchExplorerUi()
        return remote ? normalizeExplorer(remote) : null
    } catch {
        return null
    }
}

export async function fetchWindowFromServer(): Promise<WindowPreferences | null> {
    try {
        const configApi = await loadConfigApi()
        const remote = await configApi.fetchWindow()
        return remote ? normalizeWindow(remote) : null
    } catch {
        return null
    }
}

export async function fetchLocalFilesFromServer(): Promise<LocalFilesPreferences | null> {
    try {
        const configApi = await loadConfigApi()
        const remote = await configApi.fetchLocalFiles()
        return remote ? normalizeLocalFiles(remote) : null
    } catch {
        return null
    }
}

export async function pushLocalAppConfigToServer(config: AppConfigFile): Promise<void> {
    if (!shouldSyncConfigToServer()) return
    const configApi = await loadConfigApi()
    await configApi.saveAppConfig(toAppConfigSummary(config))
}

export async function pushWorkspaceSessionToServer(session: WorkspaceSessionFile): Promise<void> {
    if (!shouldSyncConfigToServer()) return
    const configApi = await loadConfigApi()
    await configApi.saveWorkspaceSession(normalizeWorkspaceSession(session))
}

export async function pushAiPreferencesToServer(prefs: AiPreferences): Promise<void> {
    if (!shouldSyncConfigToServer()) return
    const configApi = await loadConfigApi()
    await configApi.saveAiPreferences(normalizeAi(prefs))
}

export async function pushExplorerUiToServer(prefs: ExplorerPreferences): Promise<void> {
    if (!shouldSyncConfigToServer()) return
    const configApi = await loadConfigApi()
    await configApi.saveExplorerUi(normalizeExplorer(prefs))
}

export async function pushWindowToServer(prefs: WindowPreferences): Promise<void> {
    if (!shouldSyncConfigToServer()) return
    const configApi = await loadConfigApi()
    await configApi.saveWindow(normalizeWindow(prefs))
}

export async function pushLocalFilesToServer(prefs: LocalFilesPreferences): Promise<void> {
    if (!shouldSyncConfigToServer()) return
    const configApi = await loadConfigApi()
    await configApi.saveLocalFiles(normalizeLocalFiles(prefs))
}

let aiPersistTimer: ReturnType<typeof setTimeout> | null = null
let pendingAiPrefs: AiPreferences | null = null
let explorerUiPersistTimer: ReturnType<typeof setTimeout> | null = null
let pendingExplorerUi: ExplorerPreferences | null = null
let windowPersistTimer: ReturnType<typeof setTimeout> | null = null
let pendingWindow: WindowPreferences | null = null
let localFilesPersistTimer: ReturnType<typeof setTimeout> | null = null
let pendingLocalFiles: LocalFilesPreferences | null = null

export function schedulePersistAiPreferences(prefs: AiPreferences) {
    pendingAiPrefs = prefs
    if (aiPersistTimer) clearTimeout(aiPersistTimer)
    aiPersistTimer = setTimeout(() => {
        aiPersistTimer = null
        const next = pendingAiPrefs
        pendingAiPrefs = null
        if (!next) return
        void pushAiPreferencesToServer(next).catch((error) => {
            if (isQuietBackgroundSyncFailure(error)) return
            console.warn('[config] failed to persist ai-preferences', error)
        })
    }, 420)
}

export function schedulePersistExplorerUi(prefs: ExplorerPreferences) {
    pendingExplorerUi = prefs
    if (explorerUiPersistTimer) clearTimeout(explorerUiPersistTimer)
    explorerUiPersistTimer = setTimeout(() => {
        explorerUiPersistTimer = null
        const next = pendingExplorerUi
        pendingExplorerUi = null
        if (!next) return
        void pushExplorerUiToServer(next).catch((error) => {
            if (isQuietBackgroundSyncFailure(error)) return
            console.warn('[config] failed to persist explorer-ui', error)
        })
    }, 420)
}

export function schedulePersistWindow(prefs: WindowPreferences) {
    pendingWindow = prefs
    if (windowPersistTimer) clearTimeout(windowPersistTimer)
    windowPersistTimer = setTimeout(() => {
        windowPersistTimer = null
        const next = pendingWindow
        pendingWindow = null
        if (!next) return
        void pushWindowToServer(next).catch((error) => {
            if (isQuietBackgroundSyncFailure(error)) return
            console.warn('[config] failed to persist window', error)
        })
    }, 420)
}

export function schedulePersistLocalFiles(prefs: LocalFilesPreferences) {
    pendingLocalFiles = prefs
    if (localFilesPersistTimer) clearTimeout(localFilesPersistTimer)
    localFilesPersistTimer = setTimeout(() => {
        localFilesPersistTimer = null
        const next = pendingLocalFiles
        pendingLocalFiles = null
        if (!next) return
        void pushLocalFilesToServer(next).catch((error) => {
            if (isQuietBackgroundSyncFailure(error)) return
            console.warn('[config] failed to persist local-files', error)
        })
    }, 420)
}

/** Flush pending detail-file writes (exit / import). */
export async function flushDetailConfigFilesToServer(config: AppConfigFile): Promise<void> {
    if (!shouldSyncConfigToServer()) return
    if (aiPersistTimer) {
        clearTimeout(aiPersistTimer)
        aiPersistTimer = null
    }
    if (explorerUiPersistTimer) {
        clearTimeout(explorerUiPersistTimer)
        explorerUiPersistTimer = null
    }
    if (windowPersistTimer) {
        clearTimeout(windowPersistTimer)
        windowPersistTimer = null
    }
    if (localFilesPersistTimer) {
        clearTimeout(localFilesPersistTimer)
        localFilesPersistTimer = null
    }
    pendingAiPrefs = null
    pendingExplorerUi = null
    pendingWindow = null
    pendingLocalFiles = null
    const normalized = normalizeAppConfig(config)
    await Promise.all([
        pushAiPreferencesToServer(normalized.ai ?? DEFAULT_AI_PREFERENCES),
        pushExplorerUiToServer(normalized.explorer ?? DEFAULT_EXPLORER_PREFERENCES),
        pushWindowToServer(normalized.window ?? DEFAULT_WINDOW),
        pushLocalFilesToServer(normalized.localFiles ?? DEFAULT_LOCAL_FILES_PREFERENCES),
    ])
}

export function schedulePersistAppConfig(config: AppConfigFile) {
    pendingPersistConfig = config
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
        persistTimer = null
        const next = pendingPersistConfig
        pendingPersistConfig = null
        if (next) persistAppConfig(next)
    }, 280)
}

export function isSideRailItemVisible(prefs: LayoutPreferences, id: SideRailItemId): boolean {
    return isSideRailItemVisibleFromPrefs(prefs, id)
}

export function isShortcutRailItemVisible(prefs: LayoutPreferences, id: ShortcutPanel): boolean {
    return prefs.shortcutRailVisibility[id] !== false
}

export function hasVisibleShortcutRailItem(prefs: LayoutPreferences): boolean {
    return SHORTCUT_RAIL_NAV_DEFS.some((item) => isShortcutRailItemVisible(prefs, item.id))
}

export function buildAppConfigFile(config = readAppConfig()): AppConfigFile {
    return normalizeAppConfig(config)
}

export function exportAppConfigDownload(config?: AppConfigFile) {
    const file = buildAppConfigFile(config ?? readAppConfig())
    const blob = new Blob([serializeAppConfigXml(file)], {type: 'application/xml'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = APP_CONFIG_FILENAME
    anchor.click()
    URL.revokeObjectURL(url)
}

function normalizeImportedConfig(raw: unknown): AppConfigFile | null {
    if (!raw || typeof raw !== 'object') return null
    const data = raw as Partial<AppConfigFile>
    if ((data.version !== 2 && data.version !== 1) || !data.layout) return null
    return normalizeAppConfig(data)
}

export function parseAppConfigFile(text: string): AppConfigFile | null {
    const trimmed = text.trim()
    if (trimmed.startsWith('<')) {
        return normalizeImportedConfig(parseAppConfigXml(text))
    }
    try {
        return normalizeImportedConfig(JSON.parse(text))
    } catch {
        return null
    }
}

export type ApplyAppConfigHandlers = {
    applyLocale?: (locale: AppLocale) => void
    applyTheme?: (theme: NonNullable<AppConfigFile['theme']>) => void
    applyEditor?: (editor: NonNullable<AppConfigFile['editor']>) => void
    applyWindow?: (window: WindowPreferences) => void
    applyLayout: (layout: LayoutPreferences) => void
    applyExplorer?: (explorer: ExplorerPreferences) => void
    applyWorkspace?: (workspace: WorkspacePreferences) => void
    applyProfile?: (profile: NonNullable<AppConfigFile['profile']>) => void
    applyAi?: (ai: AiPreferences) => void
    applyShortcuts?: (shortcuts: ShortcutPreferences) => void
    applySqlEditorShortcutsShared?: (shortcuts: SqlEditorShortcutsLayer) => void
    applySqlEditorShortcuts?: (shortcuts: SqlEditorShortcutsLayer) => void
}

export function applyAppConfigFile(file: AppConfigFile, handlers: ApplyAppConfigHandlers) {
    const normalized = normalizeAppConfig(file)
    if (normalized.locale && handlers.applyLocale) handlers.applyLocale(normalized.locale)
    if (normalized.theme && handlers.applyTheme) handlers.applyTheme(normalized.theme)
    if (normalized.editor && handlers.applyEditor) handlers.applyEditor(normalized.editor)
    if (normalized.window && handlers.applyWindow) handlers.applyWindow(normalized.window)
    handlers.applyLayout(normalized.layout)
    if (normalized.explorer && handlers.applyExplorer) handlers.applyExplorer(normalized.explorer)
    if (normalized.workspace && handlers.applyWorkspace) handlers.applyWorkspace(normalized.workspace)
    if (normalized.profile && handlers.applyProfile) handlers.applyProfile(normalized.profile)
    if (normalized.ai && handlers.applyAi) handlers.applyAi(normalized.ai)
    if (normalized.shortcuts && handlers.applyShortcuts) handlers.applyShortcuts(normalized.shortcuts)
    // Empty `{}` is truthy — applying it via applyPersonal would clear
    // datawise.sql-editor.personal-layer on every boot/sync.
    const sharedShortcuts = normalized.sqlEditorShortcutsShared
    if (
        sharedShortcuts
        && sqlEditorShortcutsLayerHasOverrides(sharedShortcuts)
        && handlers.applySqlEditorShortcutsShared
    ) {
        handlers.applySqlEditorShortcutsShared(sharedShortcuts)
    }
    const personalShortcuts = normalized.sqlEditorShortcuts
    if (
        personalShortcuts
        && sqlEditorShortcutsLayerHasOverrides(personalShortcuts)
        && handlers.applySqlEditorShortcuts
    ) {
        handlers.applySqlEditorShortcuts(personalShortcuts)
    }
}

export function pickRestorableModule(prefs: LayoutPreferences): RestorableNavModule {
    const restored = resolveHomeNavModule(prefs.lastModule)
    if (isSideRailItemVisible(prefs, restored)) return restored
    const fallback = SIDE_RAIL_NAV_DEFS.find(
        (item) => item.section === 'main' && isSideRailItemVisible(prefs, item.id),
    )
    return (fallback?.id as RestorableNavModule) ?? HOME_NAV_MODULE
}

export function sanitizeEditorSettings(
    editor: NonNullable<AppConfigFile['editor']>,
): typeof DEFAULT_EDITOR_SETTINGS {
    const stored = readStoredEditorSettings()
    return {
        ...stored,
        ...editor,
        fontSize: clamp(editor.fontSize, stored.fontSize, EDITOR_FONT_SIZE_MIN, EDITOR_FONT_SIZE_MAX),
        lineHeight: clamp(editor.lineHeight, stored.lineHeight, EDITOR_LINE_HEIGHT_MIN, EDITOR_LINE_HEIGHT_MAX),
        maxResultRows: clamp(editor.maxResultRows, stored.maxResultRows, MAX_RESULT_ROWS_MIN, MAX_RESULT_ROWS_MAX),
    }
}

export function migrateLegacyStorageKeysOnce() {
    if (localStorage.getItem(APP_CONFIG_KEY)) return
    const hasLegacy =
        localStorage.getItem(LEGACY_LAYOUT_CONFIG_KEY)
        || localStorage.getItem(THEME_STORAGE_KEY)
        || localStorage.getItem(EDITOR_STORAGE_KEY)
        || localStorage.getItem(LEGACY_SQL_EDITOR_SHORTCUTS_STORAGE_KEY)
        || localStorage.getItem(SQL_EDITOR_SHORTCUTS_STORAGE_KEY)
        || localStorage.getItem(SQL_EDITOR_SHORTCUTS_SHARED_STORAGE_KEY)
        || localStorage.getItem(LOCALE_STORAGE_KEY)
    if (!hasLegacy) return
    persistAppConfig(readAppConfig())
}
