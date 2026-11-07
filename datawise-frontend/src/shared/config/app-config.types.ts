import type {DbType, NavModule, ShortcutPanel, WorkspaceTabType} from '@/core/types'
import type {DockFloatRect, DockPlacement} from '@/shared/layout/dock.types'
import type {AppLocale} from '@/i18n'
import type {EditorSettings} from '@/shared/config/editor-presets'
import type {SqlEditorShortcutsLayer} from '@datawise/sql-editor/types'
import type {ThemePreferences} from '@/shared/config/theme-presets'
import type {ShortcutPreferences} from '@/core/shortcuts/types'
import type {SideRailItemId} from '@/shared/config/side-rail.types'
import type {AiAnalysisConfigurableStepId, AiAnalysisMode} from '@/shared/api/ai.types'
import type {DashboardPreferences} from '@/shared/config/dashboard-preferences'

export type {DashboardPreferences}

export const APP_CONFIG_VERSION = 2 as const

export type RestorableNavModule = 'database' | 'dashboard' | 'ai' | 'packStore' | 'plugin' | 'pluginDev' | 'connectorMarket' | 'communityPlugin'

export interface WindowPreferences {
    width: number
    height: number
    x?: number | null
    y?: number | null
    maximized?: boolean
}

/** Where desktop opens http(s) workbench / console links. */
export type OpenHttpLinksIn = 'builtin' | 'system'

export interface LayoutPreferences {
    sideRailVisibility: Partial<Record<SideRailItemId, boolean>>
    shortcutRailVisibility: Partial<Record<ShortcutPanel, boolean>>
    showSideRailStrip: boolean
    showShortcutRailStrip: boolean
    showExplorerPanel: boolean
    explorerWidth: number
    shortcutPanelWidth: number
    shortcutPanelMaxHeight: number
    showTerminalPanel: boolean
    terminalHeight: number
    lastModule: RestorableNavModule
    lastShortcutPanel: ShortcutPanel | null
    /**
     * Desktop only: open Jenkins / Nacos / markdown links in the built-in CEF window
     * or the OS default browser.
     */
    openHttpLinksIn?: OpenHttpLinksIn
    /** Panel dock placement; null/undefined = classic (explorer left, terminal bottom). */
    dockPlacement?: DockPlacement | null
    /** Floating terminal rect; null/undefined = default float geometry. */
    dockTerminalFloat?: DockFloatRect | null
    /** Floating explorer rect; null/undefined = default explorer float geometry. */
    dockExplorerFloat?: DockFloatRect | null
    /** Floating shortcut rail rect; null/undefined = default shortcut float geometry. */
    dockShortcutFloat?: DockFloatRect | null
    /** Floating workspace rect; null/undefined = default workspace float geometry. */
    dockWorkspaceFloat?: DockFloatRect | null
}

export interface ExplorerPreferences {
    selectedNodeId: string | null
    searchQuery: string
    expandedNodeIds: string[]
    /** Explorer 置顶节点 id（连接 / 库 / Schema / 表），随 app.xml 持久化 */
    pinnedNodeIds: string[]
    showColumnComment: boolean
    showTableComment: boolean
    showSemanticLayer: boolean
}

export interface WorkspaceTabSnapshot {
    type: WorkspaceTabType
    title: string
    /** Editor body. Omitted for clean disk-backed local files (load on select). */
    sql?: string
    savedSql?: string
    sqlFile?: string
    localFilePath?: string
    /** Local-text baseline. Omitted for clean disk-backed files. */
    savedContent?: string
    tableName?: string
    connectionId?: string
    instanceId?: string | null
    database?: string
    explorerNodeId?: string
    dbType?: DbType
    tableView?: 'properties' | 'data' | 'ddl' | 'relations' | 'relationGraph'
    tableSection?: 'columns' | 'indexes' | 'foreignKeys'
    tabGroupId?: string
    teamSharedQuery?: {
        teamId: string
        queryId: string
        title?: string
    }
}

/** Summary prefs in app.xml (no open-tab bodies). */
export interface WorkspacePreferences {
    consoleEditorHeight: number
    showConsoleResultPanel: boolean
    restoreSession: boolean
}

export interface WorkspaceTabGroupSnapshot {
    id: string
    title: string
    collapsed?: boolean
    titleCustom?: boolean
}

/** Per user × tenant open-tab session — separate from app.xml. */
export interface WorkspaceSessionFile {
    tabs: WorkspaceTabSnapshot[]
    activeTabIndex: number
    tabGroups: WorkspaceTabGroupSnapshot[]
}

/** Desktop local-files workspace folder history (recent / last / favorites). */
export interface LocalFilesPreferences {
    lastRoot: string | null
    recentRoots: string[]
    favoriteRoots: string[]
}

export interface ProfilePreferences {
    name: string
    email: string
}

export type AiSidePanel = 'history' | 'scope'

export type AiProviderId = 'mock' | 'openai'

export type AiEmbeddingProviderId = 'hash' | 'openai'

export interface AiEmbeddingSettings {
    provider: AiEmbeddingProviderId
    baseUrl: string
    apiKey: string
    /** See {@link AiLlmSettings.apiKeyConfigured}. */
    apiKeyConfigured?: boolean
    model: string
    /** 可选；留空时按模型推断维度 */
    dimensions?: number | null
    /** 相对 base-url 的 embedding 路径，如 /embeddings */
    embeddingsPath?: string
    /** @deprecated 独立配置；仅兼容旧数据 */
    useChatConnection?: boolean
}

/** 可命名的 Embedding 配置项；defaultEmbeddingId 指向 RAG 默认项 */
export interface AiEmbeddingProfile extends AiEmbeddingSettings {
    id: string
    name: string
}

export type AiVectorStoreType = 'none' | 'memory' | 'pgvector'

/** '' = 跟随服务端 application.yml 默认 */
export type AiVectorStorePreference = '' | AiVectorStoreType

export interface AiPgVectorPreferences {
    jdbcUrl: string
    username: string
    password: string
    table: string
}

export interface AiRagPreferences {
    vectorStore: AiVectorStorePreference
    pgvector: AiPgVectorPreferences
}

export interface AiLlmSettings {
    provider: AiProviderId
    baseUrl: string
    apiKey: string
    /**
     * True when the server has a stored key but GET masked it (apiKey is blank in the client).
     * Leave apiKey blank on save to preserve the stored secret.
     */
    apiKeyConfigured?: boolean
    model: string
    temperature: number
    maxTokens: number
    /** 相对 base-url 的 chat 路径，如 /chat/completions 或 /v1/chat/completions */
    completionsPath?: string
}

/** 可命名的 LLM 配置项；defaultLlmId 指向默认项 */
export interface AiLlmProfile extends AiLlmSettings {
    id: string
    name: string
}

export type AiAnalysisLlmRouteStep = 'planning' | 'sql' | 'python' | 'summary'

export interface AiPreferences {
    sideActivePanel: AiSidePanel
    defaultLlmId: string
    /** AI 工作台当前选用的模型配置 id */
    workbenchLlmId: string
    llmProfiles: AiLlmProfile[]
    /** 分析步骤 → LLM profile id（未配置则使用 workbench 默认模型） */
    analysisStepLlmIds?: Partial<Record<AiAnalysisLlmRouteStep, string>>
    /** 数据分析流式接口：跳过 SQL 执行前人工确认 */
    skipSqlConfirmation?: boolean
    /** 禁用的分析流水线步骤（自定义模式下生效） */
    disabledAnalysisSteps?: AiAnalysisConfigurableStepId[]
    /** 分析模式：快速固定步骤 / 智能由 LLM 规划 / 自定义勾选 */
    analysisMode?: AiAnalysisMode
    /**
     * Right-rail AI assistant: how many recent chats to keep/show.
     * Clamped on normalize (default 10).
     */
    assistantHistoryLimit?: number
    defaultEmbeddingId: string
    /** RAG 向量索引使用的 embedding 配置列表 */
    embeddingProfiles: AiEmbeddingProfile[]
    /** RAG 向量库用户配置；vectorStore 留空则继承服务端默认 */
    rag: AiRagPreferences
}

export interface PluginPreferences {
    /** 插件 id → 是否启用；未记录则使用服务端目录默认值 */
    enabled: Partial<Record<string, boolean>>
    /** 插件页对照预设；未记录时 UI 默认 minimal */
    referencePresetId?: 'dba' | 'readOnlyAnalysis' | 'teamViewer' | 'developer' | 'minimal'
}

export type ConnectionHealthProbeIntervalMinutes = 1 | 5 | 15 | 30

export interface ConnectionHealthPreferences {
    /** 连接状态恶化时弹出 toast */
    alertsEnabled: boolean
    /** 同时将告警写入通知 drawer */
    drawerAlertsEnabled: boolean
    /** SQL 执行达到慢查询阈值时告警（toast + drawer） */
    slowQueryAlertsEnabled: boolean
    /** 后台定时探测间隔（分钟） */
    probeIntervalMinutes: ConnectionHealthProbeIntervalMinutes
    /** 可用 → 异常 时告警 */
    alertOnOkToError: boolean
    /** 未检测 → 异常 时告警 */
    alertOnUnknownToError: boolean
    /** 非空时仅对这些连接告警；空数组表示全部连接 */
    watchedConnectionIds: string[]
}

/** B-03: 危险 SQL 执行前确认 */
export interface DangerousSqlPreferences {
    /** 非生产环境是否弹出确认（生产环境始终确认） */
    confirmEnabled: boolean
    /** 表名白名单，支持 `*` 通配；仅非生产环境生效 */
    whitelistedTables: string[]
}

export interface AppConfigFile {
    version: typeof APP_CONFIG_VERSION
    exportedAt: string
    locale?: AppLocale
    theme?: ThemePreferences
    editor?: EditorSettings
    window?: WindowPreferences
    layout: LayoutPreferences
    explorer?: ExplorerPreferences
    workspace?: WorkspacePreferences
    localFiles?: LocalFilesPreferences
    profile?: ProfilePreferences
    ai?: AiPreferences
    plugins?: PluginPreferences
    connectionHealth?: ConnectionHealthPreferences
    dangerousSql?: DangerousSqlPreferences
    dashboard?: DashboardPreferences
    shortcuts?: ShortcutPreferences
    /** 导入/导出信封：shared 层快照（运行时权威存储见 dw-cli-sql-editor-shortcuts-shared） */
    sqlEditorShortcutsShared?: SqlEditorShortcutsLayer
    /** 导入/导出信封：personal 层快照（运行时权威存储见 datawise.sql-editor.personal-layer） */
    sqlEditorShortcuts?: SqlEditorShortcutsLayer
}
