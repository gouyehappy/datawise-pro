import {buildDefaultSnippetConfigsFromConstants} from '@sql-editor/config/snippets/builtin'
import {loadDefaultKeybindings, mergeKeybindingConfigs} from '@sql-editor/editor/shortcut-config'
import {
    normalizeQuickChipConfig,
    normalizeSqlEditorShortcutsLayer,
    normalizeSqlEditorShortcutsSettings,
    normalizeSnippetConfig,
} from '@sql-editor/config/snippets/normalize'
import {sqlEditorShortcutsLayerHasOverrides} from '@sql-editor/config/snippets/layer-overrides'
import {resolvePrimaryCompletionSlot} from '@sql-editor/constants/completion-slots'
import type {
    SqlEditorShortcutsLayer,
    SqlEditorShortcutsSettings,
    SqlSnippetConfig,
} from '@sql-editor/types'
import {resolveSqlEditorFormatterSettings} from '@sql-editor/config/formatter-settings'
import {
    DEFAULT_SQL_EDITOR_LOCALE,
    DEFAULT_SQL_EDITOR_THEME,
} from '@sql-editor/config/defaults'
import {SQL_EDITOR_FONT_SIZE_DEFAULT} from '@sql-editor/config/formatter-settings'
import {normalizeSqlEditorLocale} from '@sql-editor/i18n'
import {
    createDefaultSqlEditorAiSettings,
    normalizeSqlEditorAiLayer,
    resolveSqlEditorAiSettings
} from '@sql-editor/ai/settings'

/** 片段在合并时的身份键：主槽位 + label（与补全侧按 label 去重一致） */
export function snippetIdentityKey(
    snippet: Pick<SqlSnippetConfig, 'label' | 'slots'> & {id?: string},
): string {
    const label = String(snippet.label ?? snippet.id ?? '').trim().toLowerCase()
    if (!label) return ''
    const slot = resolvePrimaryCompletionSlot(Array.isArray(snippet.slots) ? snippet.slots : [])
    return `${slot}:${label}`
}

function findSnippetMergeIndex(list: readonly SqlSnippetConfig[], candidate: SqlSnippetConfig): number {
    const identity = snippetIdentityKey(candidate)
    return list.findIndex((item) =>
        item.id === candidate.id || (identity !== '' && snippetIdentityKey(item) === identity),
    )
}

/**
 * 设置页展示用：若某 label 已有上下文槽位片段，则隐藏同名的 global/statement_start 冗余项。
 * 保留完整 SELECT 语句模板（如 global.cnt）。
 */
export function filterRedundantGlobalSnippetsForDisplay(
    snippets: readonly SqlSnippetConfig[],
): SqlSnippetConfig[] {
    const contextualLabels = new Set<string>()
    for (const item of snippets) {
        const slot = resolvePrimaryCompletionSlot(item.slots)
        if (slot !== 'statement_start') {
            contextualLabels.add(item.label.trim().toLowerCase())
        }
    }

    return snippets.filter((item) => {
        const slot = resolvePrimaryCompletionSlot(item.slots)
        if (slot !== 'statement_start') return true

        const label = item.label.trim().toLowerCase()
        if (!contextualLabels.has(label)) return true
        if (!item.id.startsWith('global.')) return true
        if (/^\s*SELECT\b/is.test(item.insertText)) return true
        return false
    })
}

/** 空层，用于「仅个人」或重置 */
export function createEmptySqlEditorShortcutsLayer(): SqlEditorShortcutsLayer {
    return {}
}

/** 出厂默认：内置常量片段；表名补全不自动插入别名 */
export function createDefaultSqlEditorShortcutsSettings(): SqlEditorShortcutsSettings {
    return {
        autoTableAlias: false,
        showHintQuickChips: true,
        showHintBar: true,
        showSuggestDetails: true,
        showColumnCommentInSuggest: false,
        folding: true,
        showRunGutterButton: true,
        columnDiagnosticsMode: 'auto',
        vimModeEnabled: false,
        locale: DEFAULT_SQL_EDITOR_LOCALE,
        fontSize: SQL_EDITOR_FONT_SIZE_DEFAULT,
        theme: DEFAULT_SQL_EDITOR_THEME,
        formatter: resolveSqlEditorFormatterSettings(),
        disabledQuickChipIds: [],
        quickChips: [],
        snippets: buildDefaultSnippetConfigsFromConstants(),
        keybindings: loadDefaultKeybindings(),
        disabledKeybindingKeys: [],
        ai: createDefaultSqlEditorAiSettings(),
    }
}

/** 在已有完整设置上叠加一层差异 */
export function applySqlEditorShortcutsOverlay(
    base: SqlEditorShortcutsSettings,
    overlay: SqlEditorShortcutsLayer | null | undefined,
): SqlEditorShortcutsSettings {
    const layer = normalizeSqlEditorShortcutsLayer(overlay)
    if (!sqlEditorShortcutsLayerHasOverrides(layer)) {
        return base
    }

    let snippets = base.snippets
    if (layer.snippets) {
        const list = [...base.snippets]
        for (const patch of layer.snippets) {
            const id = String(patch.id ?? patch.label).trim()
            if (!id) continue
            const normalized = normalizeSnippetConfig({...patch, id}, list.length)
            const idx = findSnippetMergeIndex(list, normalized)
            if (idx >= 0) {
                list[idx] = {...list[idx], ...normalized, id: normalized.id}
            } else {
                list.push(normalized)
            }
        }
        snippets = list
    }

    let quickChips = base.quickChips ?? []
    if (layer.quickChips?.length) {
        const byId = new Map(quickChips.map((chip) => [chip.id, chip]))
        for (const patch of layer.quickChips) {
            const id = String(patch.id ?? patch.label).trim()
            if (!id) continue
            const prev = byId.get(id)
            if (prev) {
                byId.set(id, {...prev, ...patch, id})
            } else {
                byId.set(id, normalizeQuickChipConfig({...patch, id}, byId.size))
            }
        }
        quickChips = [...byId.values()]
    }

    const disabled = new Set(base.disabledQuickChipIds ?? [])
    for (const id of layer.disabledQuickChipIds ?? []) {
        disabled.add(id)
    }

    const disabledBindingKeys = [...(base.disabledKeybindingKeys ?? [])]
    for (const key of layer.disabledKeybindingKeys ?? []) {
        if (!disabledBindingKeys.includes(key)) disabledBindingKeys.push(key)
    }

    const keybindings = mergeKeybindingConfigs(
        base.keybindings,
        layer.keybindings,
        disabledBindingKeys,
    )

    return {
        autoTableAlias: layer.autoTableAlias ?? base.autoTableAlias,
        showHintQuickChips: layer.showHintQuickChips ?? base.showHintQuickChips,
        showHintBar: layer.showHintBar ?? base.showHintBar,
        showSuggestDetails: layer.showSuggestDetails ?? base.showSuggestDetails,
        showColumnCommentInSuggest:
            layer.showColumnCommentInSuggest ?? base.showColumnCommentInSuggest,
        folding: layer.folding ?? base.folding,
        showRunGutterButton: layer.showRunGutterButton ?? base.showRunGutterButton,
        columnDiagnosticsMode: layer.columnDiagnosticsMode ?? base.columnDiagnosticsMode,
        vimModeEnabled: layer.vimModeEnabled ?? base.vimModeEnabled,
        locale: layer.locale ? normalizeSqlEditorLocale(layer.locale) : base.locale,
        fontSize: layer.fontSize ?? base.fontSize,
        theme: layer.theme ?? base.theme,
        formatter: layer.formatter
            ? resolveSqlEditorFormatterSettings(layer.formatter, base.formatter)
            : base.formatter,
        disabledQuickChipIds: [...disabled],
        quickChips,
        snippets,
        keybindings,
        disabledKeybindingKeys: disabledBindingKeys,
        ai: layer.ai
            ? resolveSqlEditorAiSettings({...base.ai, ...normalizeSqlEditorAiLayer(layer.ai)})
            : base.ai,
    }
}

/** 合并多层：builtin → shared → personal */
export function mergeSqlEditorShortcutsLayers(
    layers: SqlEditorShortcutsLayer[],
): SqlEditorShortcutsSettings {
    const base = createDefaultSqlEditorShortcutsSettings()
    return layers.reduce<SqlEditorShortcutsSettings>(
        (acc, layer) => applySqlEditorShortcutsOverlay(acc, layer),
        base,
    )
}

/** 解析为最终生效设置（含插件内置通用层） */
export function resolveSqlEditorShortcutsLayers(input: {
    pluginShared?: SqlEditorShortcutsLayer | null
    shared?: SqlEditorShortcutsLayer | null
    personal?: SqlEditorShortcutsLayer | null
}): SqlEditorShortcutsSettings {
    const plugin = normalizeSqlEditorShortcutsLayer(input.pluginShared)
    const shared = normalizeSqlEditorShortcutsLayer(input.shared)
    const personal = normalizeSqlEditorShortcutsLayer(input.personal)

    const layers: SqlEditorShortcutsLayer[] = []
    if (sqlEditorShortcutsLayerHasOverrides(plugin)) layers.push(plugin)
    if (sqlEditorShortcutsLayerHasOverrides(shared)) layers.push(shared)
    if (sqlEditorShortcutsLayerHasOverrides(personal)) layers.push(personal)

    return mergeSqlEditorShortcutsLayers(layers)
}

/** 导出用：去掉 builtin 标记，保留用户可编辑字段 */
export function toExportableSqlEditorShortcutsSettings(
    settings: SqlEditorShortcutsSettings,
): SqlEditorShortcutsSettings {
    return normalizeSqlEditorShortcutsSettings({
        autoTableAlias: settings.autoTableAlias,
        showHintQuickChips: settings.showHintQuickChips,
        showHintBar: settings.showHintBar,
        showSuggestDetails: settings.showSuggestDetails,
        showColumnCommentInSuggest: settings.showColumnCommentInSuggest,
        folding: settings.folding,
        showRunGutterButton: settings.showRunGutterButton,
        columnDiagnosticsMode: settings.columnDiagnosticsMode,
        vimModeEnabled: settings.vimModeEnabled,
        locale: settings.locale,
        fontSize: settings.fontSize,
        theme: settings.theme,
        formatter: settings.formatter,
        disabledQuickChipIds: settings.disabledQuickChipIds,
        quickChips: settings.quickChips,
        snippets: settings.snippets.map(({builtin: _b, ...rest}) => rest),
        keybindings: settings.keybindings,
        disabledKeybindingKeys: settings.disabledKeybindingKeys,
        ai: settings.ai,
    })
}

/** 按 id 查片段来源层（设置页徽章用） */
export function resolveSqlSnippetSource(
    snippetId: string,
    layers: {
        pluginShared: SqlEditorShortcutsLayer | null
        shared: SqlEditorShortcutsLayer | null
        personal: SqlEditorShortcutsLayer | null
    },
): 'builtin' | 'plugin' | 'shared' | 'personal' {
    const inLayer = (layer: SqlEditorShortcutsLayer | null) =>
        layer?.snippets?.some((s) => (s.id ?? s.label) === snippetId)

    if (inLayer(layers.personal)) return 'personal'
    if (inLayer(layers.shared)) return 'shared'
    if (inLayer(layers.pluginShared)) return 'plugin'
    return 'builtin'
}
