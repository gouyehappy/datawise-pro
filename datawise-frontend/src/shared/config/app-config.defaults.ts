import {SIDE_RAIL_NAV_DEFS} from '@/shared/config/side-rail-nav'
import {SHORTCUT_RAIL_NAV_DEFS} from '@/shared/config/shortcut-rail-nav'
import {CONSOLE_EDITOR_HEIGHT_DEFAULT} from '@/shared/config/console-layout.defaults'
import {SHORTCUT_DEFINITIONS} from '@/core/shortcuts/definitions'
import type {ShortcutPreferences} from '@/core/shortcuts/types'
import type {
    AppConfigFile,
    AiPreferences,
    AiPgVectorPreferences,
    AiRagPreferences,
    AiVectorStorePreference,
    ConnectionHealthPreferences,
    DangerousSqlPreferences,
    DashboardPreferences,
    ExplorerPreferences,
    LayoutPreferences,
    PluginPreferences,
    WindowPreferences,
    WorkspacePreferences,
    WorkspaceSessionFile,
    LocalFilesPreferences,
} from '@/shared/config/app-config.types'
import {DEFAULT_AI_EMBEDDING_PROFILE, DEFAULT_AI_LLM_PROFILE} from '@/shared/config/ai-presets'
import {createEmptySqlEditorShortcutsLayer} from '@datawise/sql-editor/config/snippets'
import {createDefaultDashboardPreferences} from '@/shared/config/dashboard-preferences'

export function buildDefaultShortcutPreferences(): ShortcutPreferences {
    const prefs: ShortcutPreferences = {}
    for (const def of SHORTCUT_DEFINITIONS) {
        prefs[def.id] = def.defaultBinding
    }
    return prefs
}

export const DEFAULT_EXPLORER_WIDTH = 248
export const DEFAULT_TERMINAL_HEIGHT = 240
export const DEFAULT_SHORTCUT_PANEL_WIDTH = 280
export const DEFAULT_SHORTCUT_PANEL_MAX_HEIGHT = 420
export const DEFAULT_WINDOW: WindowPreferences = {
    width: 1440,
    height: 900,
    x: null,
    y: null,
    maximized: false,
}

export const DEFAULT_LAYOUT_PREFERENCES: LayoutPreferences = {
    sideRailVisibility: Object.fromEntries(
        SIDE_RAIL_NAV_DEFS.map((item) => [item.id, true]),
    ) as LayoutPreferences['sideRailVisibility'],
    shortcutRailVisibility: Object.fromEntries(
        SHORTCUT_RAIL_NAV_DEFS.map((item) => [item.id, true]),
    ) as LayoutPreferences['shortcutRailVisibility'],
    showSideRailStrip: true,
    showShortcutRailStrip: true,
    showExplorerPanel: true,
    explorerWidth: DEFAULT_EXPLORER_WIDTH,
    shortcutPanelWidth: DEFAULT_SHORTCUT_PANEL_WIDTH,
    shortcutPanelMaxHeight: DEFAULT_SHORTCUT_PANEL_MAX_HEIGHT,
    showTerminalPanel: false,
    terminalHeight: DEFAULT_TERMINAL_HEIGHT,
    lastModule: 'database',
    lastShortcutPanel: null,
    openHttpLinksIn: 'builtin',
    dockPlacement: null,
    dockTerminalFloat: null,
    dockExplorerFloat: null,
    dockShortcutFloat: null,
    dockWorkspaceFloat: null,
}

export const DEFAULT_EXPLORER_PREFERENCES: ExplorerPreferences = {
    selectedNodeId: null,
    searchQuery: '',
    expandedNodeIds: [],
    pinnedNodeIds: [],
    showColumnComment: true,
    showTableComment: true,
    showSemanticLayer: true,
}

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
    consoleEditorHeight: CONSOLE_EDITOR_HEIGHT_DEFAULT,
    showConsoleResultPanel: false,
    restoreSession: true,
}

export const DEFAULT_WORKSPACE_SESSION: WorkspaceSessionFile = {
    tabs: [],
    activeTabIndex: 0,
    tabGroups: [],
}

export const DEFAULT_LOCAL_FILES_PREFERENCES: LocalFilesPreferences = {
    lastRoot: null,
    recentRoots: [],
    favoriteRoots: [],
}

export const DEFAULT_PLUGIN_PREFERENCES: PluginPreferences = {
    enabled: {},
}

export const DEFAULT_CONNECTION_HEALTH_PREFERENCES: ConnectionHealthPreferences = {
    alertsEnabled: true,
    drawerAlertsEnabled: true,
    slowQueryAlertsEnabled: true,
    probeIntervalMinutes: 5,
    alertOnOkToError: true,
    alertOnUnknownToError: true,
    watchedConnectionIds: [],
}

export const DEFAULT_DANGEROUS_SQL_PREFERENCES: DangerousSqlPreferences = {
    confirmEnabled: true,
    whitelistedTables: [],
}

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = createDefaultDashboardPreferences()

export const DEFAULT_AI_PGVECTOR_PREFERENCES: AiPgVectorPreferences = {
    jdbcUrl: '',
    username: '',
    password: '',
    table: 'ai_evidence_embeddings',
}

export const DEFAULT_AI_RAG_PREFERENCES: AiRagPreferences = {
    vectorStore: '',
    pgvector: {...DEFAULT_AI_PGVECTOR_PREFERENCES},
}

export const DEFAULT_AI_PREFERENCES: AiPreferences = {
    sideActivePanel: 'history',
    defaultLlmId: DEFAULT_AI_LLM_PROFILE.id,
    workbenchLlmId: DEFAULT_AI_LLM_PROFILE.id,
    llmProfiles: [{...DEFAULT_AI_LLM_PROFILE}],
    skipSqlConfirmation: false,
    disabledAnalysisSteps: [],
    analysisMode: 'smart',
    assistantHistoryLimit: 10,
    defaultEmbeddingId: DEFAULT_AI_EMBEDDING_PROFILE.id,
    embeddingProfiles: [{...DEFAULT_AI_EMBEDDING_PROFILE}],
    rag: {...DEFAULT_AI_RAG_PREFERENCES, pgvector: {...DEFAULT_AI_PGVECTOR_PREFERENCES}},
}

export function createDefaultAppConfig(): AppConfigFile {
    return {
        version: 2,
        exportedAt: new Date().toISOString(),
        layout: {...DEFAULT_LAYOUT_PREFERENCES},
        explorer: {...DEFAULT_EXPLORER_PREFERENCES},
        workspace: {...DEFAULT_WORKSPACE_PREFERENCES},
        localFiles: {...DEFAULT_LOCAL_FILES_PREFERENCES, recentRoots: [], favoriteRoots: []},
        window: {...DEFAULT_WINDOW},
        ai: {...DEFAULT_AI_PREFERENCES},
        plugins: {...DEFAULT_PLUGIN_PREFERENCES, enabled: {...DEFAULT_PLUGIN_PREFERENCES.enabled}},
        connectionHealth: {...DEFAULT_CONNECTION_HEALTH_PREFERENCES, watchedConnectionIds: []},
        dangerousSql: {...DEFAULT_DANGEROUS_SQL_PREFERENCES, whitelistedTables: []},
        dashboard: createDefaultDashboardPreferences(),
        shortcuts: buildDefaultShortcutPreferences(),
        sqlEditorShortcutsShared: createEmptySqlEditorShortcutsLayer(),
        sqlEditorShortcuts: createEmptySqlEditorShortcutsLayer(),
    }
}
