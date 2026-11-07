import type {MaybeRef} from 'vue'
import type * as monaco from 'monaco-editor'
import type {
    ResolvedSqlEditorFormatterSettings,
    SqlEditorFormatterSettings
} from '@sql-editor/config/formatter-settings'

/** 列元数据（类型 / 主键 / 注释 / 枚举值） */
export interface SqlColumnMeta {
    name: string
    type?: string
    pk?: boolean
    comment?: string
    /** 列可选值（枚举 / 字典），用于 IN / = 补全 */
    enumValues?: string[]
    /** 是否可空（宿主 introspection 提供时用于文档与 IS NULL 提示） */
    nullable?: boolean
    /** 默认值原文 */
    defaultValue?: string
}

/** 外键关系 */
export interface SqlForeignKey {
    fromTable: string
    fromColumn: string
    toTable: string
    toColumn: string
}

/** 单表列加载结果 */
export interface SqlTableColumnsResult {
    columns: SqlColumnMeta[]
    foreignKeys?: SqlForeignKey[]
}

/** 近期 SQL（宿主注入，按连接/库召回） */
export interface SqlRecentQuery {
    id: string
    sql: string
    label?: string
    connectionId?: string
    database?: string
    tables?: string[]
}

export interface SqlRecentQueryScope {
    connectionId?: string
    database?: string
}

/** 补全 Schema：表名 + 各表字段 + 可选外键 */
export interface SqlEditorSchema {
    tables: string[]
    columns: Record<string, SqlColumnMeta[]>
    foreignKeys?: SqlForeignKey[]
    /** 表名 → catalog / 库名，用于表补全展示归属 */
    tableCatalogs?: Record<string, string>
    /** 表名 → 表注释（宿主 introspection 提供时用于补全旁注） */
    tableComments?: Record<string, string>
    /** Trino / Presto 等 catalog 列表 */
    catalogs?: string[]
    /** catalog → schema 列表 */
    schemasByCatalog?: Record<string, string[]>
    /** catalog.schema → 表索引（Trino 等按 SQL 限定名懒加载） */
    tablesByDatabase?: Record<string, SqlDatabaseTablesIndex>
    /** 列总数缓存（由 useSqlIntelliSense / withSchemaColumnCount 维护） */
    columnCount?: number
}

export interface SqlDatabaseTablesIndex {
    tables: string[]
    tableIds: Record<string, string>
    /** 本批表注释（与 tables 对齐） */
    tableComments?: Record<string, string>
    /** 已尝试解析注释（即使为空也 true，避免 scope 缓存反复 load） */
    commentsResolved?: boolean
}

/** catalog / schema 索引（由 Explorer 等宿主提供） */
export interface SqlCatalogSchemaIndex {
    catalogs: string[]
    schemasByCatalog: Record<string, string[]>
}

/** 动态 Schema 加载器（接入 Explorer / 自定义后端） */
export interface SqlSchemaProvider {
    /** 加载指定连接 + 库下的全部表 */
    loadTables(
        connectionId: string,
        databaseName: string,
    ): Promise<{
        tables: string[]
        tableIds: Record<string, string>
        /** 本批表的 catalog / 库名（写入补全展示） */
        catalog?: string
        /** 本批表注释 */
        tableComments?: Record<string, string>
    }>

    /** 加载单表字段与外键（可选） */
    loadColumns(tableId: string): Promise<SqlTableColumnsResult | SqlColumnMeta[]>

    /** 加载 catalog / schema 索引（Trino / Presto 等） */
    loadCatalogSchemaIndex?(
        connectionId: string,
    ): Promise<SqlCatalogSchemaIndex>

    /**
     * 加载列枚举 / 采样 distinct（可选，用于 IN 列表补全）。
     * 未实现时回退到列元数据中的 enumValues。
     */
    loadColumnEnumValues?(tableId: string, columnName: string): Promise<string[]>

    /** 数据源树是否就绪（可选，用于触发重新加载） */
    isReady?(): boolean
}

export type SqlStatementKind = 'empty' | 'select' | 'insert' | 'update' | 'delete' | 'ddl' | 'unknown'

export type SqlCompletionSlot =
    | 'statement_start'
    | 'select_list'
    | 'from'
    | 'join'
    | 'on'
    | 'where'
    | 'group_by'
    | 'having'
    | 'order_by'
    | 'tail'
    | 'set'
    | 'values'
    | 'insert_columns'
    | 'update_table'
    | 'column_ref'

/** Monaco 补全项用的运行时片段形状 */
export interface SqlSnippet {
    label: string
    insertText: string
    detail?: string
}

/** 用户可配置的 Tab 片段（Monaco snippet 语法） */
export interface SqlSnippetConfig {
    id: string
    label: string
    insertText: string
    detail: string
    enabled: boolean
    slots: SqlCompletionSlot[]
    builtin?: boolean
}

/** 可配置的编辑器快捷键 */
export interface SqlKeybindingConfig {
    id: string
    /** Monaco editor.action.* 命令 */
    command: string
    /** 如 Ctrl+Shift+D、Shift+Alt+Down */
    keys: string
    /** i18n 键，默认 shortcut.{id} */
    labelKey?: string
    enabled?: boolean
    menuOrder?: number
}

/** AI 助手动作（生成 / 解释 / 优化 / 修错 / Mock 数据） */
export type SqlEditorAiAction = 'generate' | 'explain' | 'optimize' | 'fix' | 'mock'

/** AI 补全 / 芯片触发载荷 */
export interface SqlEditorAiAssistPayload {
    action: SqlEditorAiAction
    prompt?: string
}

/** 可选 AI 助手（浏览器直连 OpenAI 兼容 API，无后端） */
export interface SqlEditorAiSettings {
    /** 开启后在 HintBar 显示 AI 入口 */
    enabled?: boolean
    /** API 根地址，如 https://api.openai.com/v1 */
    baseUrl?: string
    apiKey?: string
    /** 模型 id，默认 gpt-4o-mini */
    model?: string
    /** 在补全列表与 HintBar 芯片中展示 AI 项，默认开启 */
    completionEnabled?: boolean
}

/** SQL 编辑器快捷操作与补全行为 */
export interface SqlEditorShortcutsSettings {
    autoTableAlias: boolean
    /** 提示条快捷芯片，默认开启 */
    showHintQuickChips?: boolean
    /** 显示上下文提示条（START / 快捷芯片 / 快捷键），默认关闭 */
    showHintBar?: boolean
    /** 补全列表选中项时显示右侧 SQL 预览面板，默认开启 */
    showSuggestDetails?: boolean
    /** 字段补全主列表名称旁显示注释短注，默认关闭（注释仍在二级文档面板） */
    showColumnCommentInSuggest?: boolean
    /** 代码折叠（Monaco folding / gutter controls），默认开启 */
    folding?: boolean
    /** 光标在语句上时显示行内执行按钮，默认开启 */
    showRunGutterButton?: boolean
    /** 编辑器 UI 语言 */
    locale?: SqlEditorLocale
    /** 编辑器字号；未设置时跟随宿主 Monaco 配置 */
    fontSize?: number
    /** Monaco 配色主题（深色 one-dark / 浅色 github-light） */
    theme?: string
    /** SQL 格式化选项 */
    formatter?: ResolvedSqlEditorFormatterSettings
    /** 禁用的内置芯片 id（个人/团队层覆盖） */
    disabledQuickChipIds?: string[]
    /** 个人/团队自定义芯片 */
    quickChips?: SqlQuickChipConfig[]
    snippets: SqlSnippetConfig[]
    /** 快捷键（默认来自 shortcuts-config/default.txt，可被层覆盖） */
    keybindings: SqlKeybindingConfig[]
    /** 禁用的快捷键，格式 id|keys，如 delete_line|Ctrl+D */
    disabledKeybindingKeys?: string[]
    /** AI 助手（个人层 localStorage） */
    ai?: SqlEditorAiSettings
}

/** 通用 / 个人配置层：只存差异项，使用时与下层合并 */
export type SqlEditorShortcutsLayer = Partial<
    Omit<SqlEditorShortcutsSettings, 'formatter'> & {
    formatter?: SqlEditorFormatterSettings
}
>

export interface SqlEditorContextInfo {
    statement: SqlStatementKind
    slot: SqlCompletionSlot
    /** 当前槽位短标签，如 WHERE / JOIN */
    slotLabel: string
    hint: string
    tableCount: number
    columnCount: number
    aliases: { alias: string; table: string }[]
    /** 提示条一键插入 */
    quickActions: SqlQuickAction[]
    /** 提示条快捷键摘要 */
    shortcutHint: string
    /** 提示条快捷键芯片（去重后） */
    shortcutItems: HintShortcutItem[]
    /** 提示条快捷键完整说明（hover） */
    shortcutHintTitle: string
    /** 开发态：补全阶段可观测信息 */
    completionDebug?: {
        stage: string
        keywordSlot: string
        keywordPhase: string
    }
}

/** 提示条快捷键芯片 */
export interface HintShortcutItem {
    id: string
    keys: string
    label: string
}

/** 提示条快捷芯片（运行时） */
export interface SqlQuickAction {
    id: string
    label: string
    insertText: string
    kind?: 'keyword' | 'snippet' | 'text'
    snippet?: boolean
    triggerSuggest?: boolean
    /** i18n tooltip key under sql-editor messages */
    titleKey?: string
    /** AI 动作：点击后不插入 insertText，而是触发 AI */
    aiAction?: SqlEditorAiAction
    /** AI 预设 prompt（可选） */
    aiPrompt?: string
}

/** 可配置的提示条芯片（设置页 / 导入 JSON） */
export interface SqlQuickChipConfig extends SqlQuickAction {
    enabled: boolean
    slots: SqlCompletionSlot[]
    builtin?: boolean
}

/** 行内 gutter 操作回调载荷 */
export type SqlGutterStatementPayload = {
    sql: string
    anchorLine: number
}

/** @deprecated use SqlGutterStatementPayload */
export type SqlRunStatementPayload = SqlGutterStatementPayload

/** SqlEditor 对外暴露的编辑器 API */
export interface SqlEditorExpose {
    getSelectedText(): string

    getExecutableSql(): string

    formatDocument(): boolean

    /** 仅格式化选区；无选区时返回 false */
    formatSelection(): boolean

    /** 折叠全部可折叠语句 */
    foldAll(): void

    /** 展开全部折叠 */
    unfoldAll(): void

    layout(): void

    insertTextAtCursor(text: string): void

    insertSnippetAtCursor(snippet: string): void

    /** 在空行（或文末）插入带 AI 注释的 SQL */
    insertAiGeneratedSql(prompt: string, generatedSql: string): void

    triggerSuggest(): void

    /** 光标所在行的可执行 SQL（无选区时用于执行） */
    getCurrentLineSql(): string

    /** 光标所在行号（1-based）；当前行无可执行 SQL 时为 null */
    getCurrentLineNumber(): number | null

    getSelectionStartLine(): number | null

    goToLine(lineNumber: number, highlight?: boolean): void

    clearErrorLine(): void

    setErrorLine(lineNumber: number | null): void

    refreshColumnDiagnostics?(): void

    /** 打开 SQL 编辑器设置抽屉 */
    openSettings?(): boolean
}

export type SqlEditorLocale = 'en' | 'zh-CN'

export interface SqlEditorThemeOption {
    id: string
    label: string
}

/** 宿主应用注入：主题、Monaco 选项等（语言在编辑器设置内切换） */
export interface SqlEditorGlobalConfig {
    theme?: MaybeRef<string>
    monacoOptions?: () => monaco.editor.IStandaloneEditorConstructionOptions
    /** Monaco 主题列表；与 setTheme 同时提供时在设置面板展示 */
    themeOptions?: MaybeRef<SqlEditorThemeOption[]>
    setTheme?: (theme: string) => void
}

/** 片段配置层（external = 团队导入，personal = 个人覆盖） */
export interface SqlEditorSnippetLayers {
    external?: SqlEditorShortcutsLayer | null
    personal?: SqlEditorShortcutsLayer | null
}

/** 创建 Runtime 时的选项 */
export interface SqlEditorRuntimeOptions {
    dialect?: string
    schema?: SqlEditorSchema
    locale?: SqlEditorLocale | string
    snippetLayers?: SqlEditorSnippetLayers
    /** 创建后立即 sync 到补全引擎，默认 true */
    sync?: boolean
}

/**
 * 统一运行时：Schema、方言、片段层合并后的唯一入口。
 * 宿主应用通过 createSqlEditorRuntime + provide 注入；也可在 Store 中调用 setSnippetLayers。
 */
export interface SqlEditorRuntime {
    getSchema(): SqlEditorSchema

    setSchema(schema: SqlEditorSchema | null | undefined): void

    getDialect(): string | undefined

    setDialect(dialect: string | undefined): void

    getLocale(): SqlEditorLocale

    setLocale(locale: SqlEditorLocale | string | undefined): void

    getSnippetLayers(): SqlEditorSnippetLayers

    setSnippetLayers(layers: SqlEditorSnippetLayers): void

    /** 插件内置 sql-snippets.shared.json */
    getPluginSnippetLayer(): SqlEditorShortcutsLayer

    /** 宿主可关闭插件内置片段层（如 DataWise 插件中心） */
    setPluginBundledSnippetsEnabled(enabled: boolean): void

    isPluginBundledSnippetsEnabled(): boolean

    /** 宿主可关闭团队/导入片段层 */
    setTeamSnippetsEnabled(enabled: boolean): void

    isTeamSnippetsEnabled(): boolean

    /** 宿主可关闭个人片段覆盖层 */
    setPersonalSnippetsEnabled(enabled: boolean): void

    isPersonalSnippetsEnabled(): boolean

    getEffectiveSettings(): SqlEditorShortcutsSettings

    isAutoTableAliasEnabled(): boolean

    /** 编辑器选中文本（供补全 AI 场景） */
    getSelectedText(): string

    setSelectedText(text: string | undefined): void

    /** 宿主注入的近期 SQL（补全召回） */
    getRecentQueries(): SqlRecentQuery[]

    setRecentQueries(items: SqlRecentQuery[]): void

    getRecentQueryScope(): SqlRecentQueryScope

    setRecentQueryScope(scope: SqlRecentQueryScope): void

    setAiAssistHandler(handler: ((payload: SqlEditorAiAssistPayload) => void) | null): void

    invokeAiAssist(payload: SqlEditorAiAssistPayload): void

    /** 将当前状态写入补全 Provider；publishLayers=false 时仅刷新方言/语言，不写回全局片段缓存 */
    sync(options?: { publishLayers?: boolean }): void

    dispose(): void
}
