import type {SqlCompletionSlot} from '@datawise/sql-editor/types'

export {
    LEGACY_PERSONAL_SHORTCUTS_KEY as LEGACY_SQL_EDITOR_SHORTCUTS_STORAGE_KEY,
    SQL_EDITOR_PERSONAL_SETTINGS_KEY as SQL_EDITOR_SHORTCUTS_STORAGE_KEY,
} from '@datawise/sql-editor/settings/personal-storage'

export const SQL_EDITOR_SHORTCUTS_SHARED_STORAGE_KEY = 'dw-cli-sql-editor-shortcuts-shared'

export type {
    SqlCompletionSlot,
    SqlEditorShortcutsSettings,
    SqlSnippetConfig,
} from '@datawise/sql-editor/types'

export type {
    SqlEditorShortcutsLayer,
} from '@datawise/sql-editor/types'

export {
    buildDefaultSnippetConfigsFromConstants,
    createDefaultSqlEditorShortcutsSettings,
    createEmptySqlEditorShortcutsLayer,
    resolveSqlEditorShortcutsLayers,
} from '@datawise/sql-editor/config/snippets'

/** 设置页分组展示顺序 */
export const SQL_SNIPPET_SLOT_ORDER = [
    'statement_start',
    'select_list',
    'join',
    'on',
    'where',
    'group_by',
    'tail',
] as const

export type SqlSnippetSlotGroup = (typeof SQL_SNIPPET_SLOT_ORDER)[number]

export const SQL_SNIPPET_SLOT_OPTIONS: SqlCompletionSlot[] = [
    'statement_start',
    'select_list',
    'from',
    'join',
    'on',
    'where',
    'group_by',
    'having',
    'order_by',
    'tail',
    'set',
    'values',
    'insert_columns',
]
