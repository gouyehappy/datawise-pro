import type {
    SqlCompletionSlot,
    SqlEditorShortcutsLayer,
    SqlEditorShortcutsSettings,
    SqlKeybindingConfig,
    SqlQuickChipConfig,
    SqlSnippetConfig,
} from '@sql-editor/types'
import {normalizeSqlEditorThemeId} from '@sql-editor/constants/editor-themes'
import {
    DEFAULT_SQL_EDITOR_LOCALE,
    DEFAULT_SQL_EDITOR_THEME,
} from '@sql-editor/config/defaults'
import {
    clampSqlEditorFontSize,
    normalizeSqlEditorFormatterLayer,
    resolveSqlEditorFormatterSettings,
    SQL_EDITOR_FONT_SIZE_DEFAULT,
} from '@sql-editor/config/formatter-settings'
import {isSqlEditorCommandAllowed, loadDefaultKeybindings, normalizeKeyChord} from '@sql-editor/editor/shortcut-config'
import {normalizeSqlEditorLocale} from '@sql-editor/i18n'
import {
    createDefaultSqlEditorAiSettings,
    normalizeSqlEditorAiLayer,
    resolveSqlEditorAiSettings
} from '@sql-editor/ai/settings'
import {normalizeSqlColumnDiagnosticsMode} from '@sql-editor/constants/large-document'

const SLOT_SET = new Set<string>([
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
    'update_table',
    'column_ref',
])

/** 规范化单条片段：补全 id、过滤非法 slot */
export function normalizeSnippetConfig(
    raw: Partial<SqlSnippetConfig> & Pick<SqlSnippetConfig, 'label' | 'insertText'>,
    index: number,
): SqlSnippetConfig {
    const id = String(raw.id ?? raw.label ?? `snippet-${index}`).trim()
    const slots = Array.isArray(raw.slots)
        ? raw.slots.filter((s): s is SqlCompletionSlot => SLOT_SET.has(s))
        : []

    return {
        id,
        label: String(raw.label ?? id).trim(),
        insertText: String(raw.insertText ?? ''),
        detail: String(raw.detail ?? ''),
        enabled: raw.enabled !== false,
        slots,
        builtin: raw.builtin === true,
    }
}

/** 规范化单条快捷芯片 */
export function normalizeQuickChipConfig(
    raw: Partial<SqlQuickChipConfig> & Pick<SqlQuickChipConfig, 'label' | 'insertText'>,
    index: number,
): SqlQuickChipConfig {
    const id = String(raw.id ?? raw.label ?? `chip-${index}`).trim()
    const slots: SqlCompletionSlot[] = Array.isArray(raw.slots)
        ? raw.slots.filter((s): s is SqlCompletionSlot => SLOT_SET.has(s))
        : ['where']

    return {
        id,
        label: String(raw.label ?? id).trim(),
        insertText: String(raw.insertText ?? ''),
        kind: raw.kind,
        snippet: raw.snippet === true,
        triggerSuggest: raw.triggerSuggest === true,
        titleKey: raw.titleKey,
        enabled: raw.enabled !== false,
        slots,
        builtin: raw.builtin === true,
    }
}

/** 规范化单条快捷键 */
export function normalizeKeybindingConfig(
    raw: Partial<SqlKeybindingConfig> & Pick<SqlKeybindingConfig, 'id' | 'command' | 'keys'>,
    index: number,
): SqlKeybindingConfig {
    const id = String(raw.id ?? `binding-${index}`).trim()
    const command = String(raw.command ?? '').trim()
    const keys = normalizeKeyChord(String(raw.keys ?? ''))

    return {
        id,
        command,
        keys,
        labelKey: raw.labelKey ? String(raw.labelKey).trim() : `shortcut.${id}`,
        enabled: raw.enabled !== false,
        menuOrder: typeof raw.menuOrder === 'number' ? raw.menuOrder : index + 1,
    }
}

/** 规范化一层配置（通用 / 个人） */
export function normalizeSqlEditorShortcutsLayer(
    layer: SqlEditorShortcutsLayer | null | undefined,
): SqlEditorShortcutsLayer {
    if (!layer || typeof layer !== 'object') return {}

    const next: SqlEditorShortcutsLayer = {}
    if (typeof layer.autoTableAlias === 'boolean') {
        next.autoTableAlias = layer.autoTableAlias
    }
    if (typeof layer.showHintQuickChips === 'boolean') {
        next.showHintQuickChips = layer.showHintQuickChips
    }
    if (typeof layer.showHintBar === 'boolean') {
        next.showHintBar = layer.showHintBar
    }
    if (typeof layer.showSuggestDetails === 'boolean') {
        next.showSuggestDetails = layer.showSuggestDetails
    }
    if (typeof layer.showColumnCommentInSuggest === 'boolean') {
        next.showColumnCommentInSuggest = layer.showColumnCommentInSuggest
    }
    if (typeof layer.folding === 'boolean') {
        next.folding = layer.folding
    }
    if (typeof layer.showRunGutterButton === 'boolean') {
        next.showRunGutterButton = layer.showRunGutterButton
    }
    if (layer.columnDiagnosticsMode !== undefined) {
        next.columnDiagnosticsMode = normalizeSqlColumnDiagnosticsMode(layer.columnDiagnosticsMode)
    }
    if (typeof layer.vimModeEnabled === 'boolean') {
        next.vimModeEnabled = layer.vimModeEnabled
    }
    if (layer.locale) next.locale = normalizeSqlEditorLocale(layer.locale)
    const fontSize = clampSqlEditorFontSize(layer.fontSize)
    if (fontSize !== undefined) next.fontSize = fontSize
    const theme = normalizeSqlEditorThemeId(layer.theme)
    if (theme) next.theme = theme
    const formatter = normalizeSqlEditorFormatterLayer(layer.formatter)
    if (formatter) next.formatter = formatter
    if (Array.isArray(layer.disabledQuickChipIds)) {
        next.disabledQuickChipIds = layer.disabledQuickChipIds
            .map((id) => String(id).trim())
            .filter(Boolean)
    }
    if (Array.isArray(layer.snippets)) {
        next.snippets = layer.snippets.map((item, i) => normalizeSnippetConfig(item, i))
    }
    if (Array.isArray(layer.quickChips)) {
        next.quickChips = layer.quickChips.map((item, i) => normalizeQuickChipConfig(item, i))
    }
    if (Array.isArray(layer.keybindings)) {
        next.keybindings = layer.keybindings
            .filter((item) => isSqlEditorCommandAllowed(String(item.command ?? '')))
            .map((item, i) => normalizeKeybindingConfig(item, i))
    }
    if (Array.isArray(layer.disabledKeybindingKeys)) {
        next.disabledKeybindingKeys = layer.disabledKeybindingKeys
            .map((k) => String(k).trim())
            .filter(Boolean)
    }
    const ai = normalizeSqlEditorAiLayer(layer.ai)
    if (ai) next.ai = ai
    return next
}

/** 规范化完整设置（导入 / 持久化用） */
export function normalizeSqlEditorShortcutsSettings(
    raw: Partial<SqlEditorShortcutsSettings> | null | undefined,
): SqlEditorShortcutsSettings {
    const snippets = Array.isArray(raw?.snippets)
        ? raw!.snippets.map((item, i) => normalizeSnippetConfig(item, i))
        : []

    return {
        autoTableAlias: raw?.autoTableAlias !== false,
        showHintQuickChips: raw?.showHintQuickChips !== false,
        showHintBar: raw?.showHintBar !== false,
        showSuggestDetails: raw?.showSuggestDetails !== false,
        showColumnCommentInSuggest: raw?.showColumnCommentInSuggest === true,
        folding: raw?.folding !== false,
        showRunGutterButton: raw?.showRunGutterButton !== false,
        columnDiagnosticsMode: normalizeSqlColumnDiagnosticsMode(raw?.columnDiagnosticsMode),
        vimModeEnabled: raw?.vimModeEnabled === true,
        locale: normalizeSqlEditorLocale(raw?.locale ?? DEFAULT_SQL_EDITOR_LOCALE),
        fontSize: clampSqlEditorFontSize(raw?.fontSize) ?? SQL_EDITOR_FONT_SIZE_DEFAULT,
        theme: normalizeSqlEditorThemeId(raw?.theme) ?? DEFAULT_SQL_EDITOR_THEME,
        formatter: resolveSqlEditorFormatterSettings(normalizeSqlEditorFormatterLayer(raw?.formatter)),
        disabledQuickChipIds: Array.isArray(raw?.disabledQuickChipIds) ? raw!.disabledQuickChipIds : [],
        quickChips: Array.isArray(raw?.quickChips)
            ? raw!.quickChips.map((item, i) => normalizeQuickChipConfig(item, i))
            : [],
        snippets,
        keybindings: Array.isArray(raw?.keybindings)
            ? raw!.keybindings.map((item, i) => normalizeKeybindingConfig(item, i))
            : loadDefaultKeybindings(),
        disabledKeybindingKeys: Array.isArray(raw?.disabledKeybindingKeys) ? raw!.disabledKeybindingKeys : [],
        ai: resolveSqlEditorAiSettings(raw?.ai),
    }
}
