/**
 * @datawise/sql-editor — 公共 API
 *
 * 推荐用法：
 * 1. installSqlEditorPlugin(app, options)  一次安装
 * 2. <SqlEditor v-model="sql" dialect="mysql" :schema-provider="provider" />
 * 3. createSqlEditorRuntime()  宿主侧控制片段 / Schema（可选）
 *
 * 高级集成请使用 subpath：
 * - @datawise/sql-editor/completion   grammar / 补全分析
 * - @datawise/sql-editor/settings/*    个人层读写
 * - @datawise/sql-editor/config/snippets
 * - @datawise/sql-editor/editor/shortcut-config
 * - @datawise/sql-editor/utils/*
 * - @datawise/sql-editor/constants/*
 */

// --- 组件 ---
export {default as SqlEditor} from './components/SqlEditor.vue'
export {default as SqlEditorHintBar} from './components/SqlEditorHintBar.vue'
export {default as SqlEditorSettingsDrawer} from './components/SqlEditorSettingsDrawer.vue'
export {default as SqlEditorSettingsShell} from './components/settings/SqlEditorSettingsShell.vue'
export {default as SqlSnippetsEditorWorkbench} from './components/settings/SqlSnippetsEditorWorkbench.vue'

// --- 插件（推荐入口）---
export {installSqlEditorPlugin, type SqlEditorPluginOptions} from './plugin'

// --- 注入键 ---
export {
    SQL_EDITOR_CONFIG_KEY,
    SQL_EDITOR_RUNTIME_KEY,
    SQL_EDITOR_SHORTCUTS_CONTROLLER_KEY,
} from './config/injection'
export {DEFAULT_SQL_EDITOR_THEME, DEFAULT_SQL_EDITOR_LOCALE, DEFAULT_SQL_EDITOR_CONFIG} from './config/defaults'
export {
    SQL_EDITOR_DARK_THEME,
    SQL_EDITOR_LIGHT_THEME,
    SQL_EDITOR_THEME_OPTIONS,
    buildSqlEditorThemeOptions,
    normalizeSqlEditorThemeId,
    type SqlEditorThemeId,
} from './constants/editor-themes'
export {ensureSqlEditorMonacoThemes, applySqlEditorMonacoTheme} from './monaco/themes'

// --- Runtime（补全 / 片段 / Schema 统一 API）---
export {
    createSqlEditorRuntime,
    getDefaultSqlEditorRuntime,
    setDefaultSqlEditorRuntime,
    getActiveSqlEditorRuntime,
    setActiveSqlEditorRuntime,
    resetActiveSqlEditorRuntime,
} from './runtime/sql-editor-runtime'
export type {SqlEditorSnippetLayers} from './runtime/sql-editor-runtime'

// --- Schema Provider ---
export {createStaticSchemaProvider} from './providers/static-schema-provider'

// --- 初始化 ---
export {ensureSqlEditorSetup} from './setup'

// --- 类型 ---
export type {
    SqlEditorSchema,
    SqlSchemaProvider,
    SqlColumnMeta,
    SqlForeignKey,
    SqlTableColumnsResult,
    SqlEditorContextInfo,
    SqlEditorExpose,
    SqlEditorGlobalConfig,
    SqlEditorRuntime,
    SqlEditorRuntimeOptions,
    SqlStatementKind,
    SqlCompletionSlot,
    SqlSnippetConfig,
    SqlEditorShortcutsSettings,
    SqlEditorShortcutsLayer,
    SqlSnippet,
    SqlEditorLocale,
    SqlEditorThemeOption,
    SqlQuickAction,
    SqlQuickChipConfig,
    SqlKeybindingConfig,
    HintShortcutItem,
} from './types'
export type {SqlTablePeekPayload} from './utils/sql-table-peek'

// --- i18n ---
export {
    normalizeSqlEditorLocale,
    detectBrowserSqlEditorLocale,
    sqlEditorT,
    translateSnippetDetail,
    SQL_EDITOR_MESSAGES,
} from './i18n'
export type {SqlEditorMessageKey} from './i18n'
export {useSqlEditorI18n} from './composables/useSqlEditorI18n'

// --- Composables ---
export {useSqlIntelliSense} from './composables/useSqlIntelliSense'
export type {UseSqlIntelliSenseOptions} from './composables/useSqlIntelliSense'
export {useSqlEditorHints} from './composables/useSqlEditorHints'
export {
    useSqlEditorShortcutsController,
    type SqlEditorShortcutsController,
    type SqlSnippetSource,
} from './composables/useSqlEditorShortcutsController'
export {useCompletionSlotLabel} from './composables/useCompletionSlotLabel'
export {useSettingsSnippetEditor} from './composables/useSettingsSnippetEditor'

// --- Monaco 选项 ---
export {SQL_EDITOR_MONACO_OPTIONS, resolveSqlEditorMonacoOptions} from './constants/editor-options'
