import {mergeSqlEditorShortcutsLayers} from '@sql-editor/config/snippets/merge'
import {sqlEditorShortcutsLayerHasOverrides} from '@sql-editor/config/snippets/layer-overrides'
import {normalizeSqlEditorShortcutsLayer} from '@sql-editor/config/snippets/normalize'
import type {SqlEditorShortcutsLayer, SqlSnippetConfig} from '@sql-editor/types'

export const SQL_EDITOR_PERSONAL_SETTINGS_KEY = 'datawise.sql-editor.personal-layer'

/** @deprecated 旧版设置页 personal 键；首次读取时迁移到 {@link SQL_EDITOR_PERSONAL_SETTINGS_KEY} */
export const LEGACY_PERSONAL_SHORTCUTS_KEY = 'dw-cli-sql-editor-shortcuts'

export function isPersonalLayerEmpty(layer: SqlEditorShortcutsLayer | null | undefined): boolean {
    return !sqlEditorShortcutsLayerHasOverrides(layer)
}

function readRawPersonalLayer(key: string): SqlEditorShortcutsLayer {
    if (typeof localStorage === 'undefined') return {}
    try {
        const raw = localStorage.getItem(key)
        if (!raw) return {}
        return repairPersonalKeybindingOverrides(
            normalizeSqlEditorShortcutsLayer(JSON.parse(raw) as SqlEditorShortcutsLayer),
        )
    } catch {
        return {}
    }
}

/** 修复旧版 normalize 误删个人层自定义命令导致「改了快捷键却失效」 */
export function repairPersonalKeybindingOverrides(layer: SqlEditorShortcutsLayer): SqlEditorShortcutsLayer {
    const personalKb = layer.keybindings ?? []
    const disabled = layer.disabledKeybindingKeys ?? []
    if (!disabled.length) return layer

    const customIds = ['toggle_ai', 'format_selection', 'open_settings'] as const
    let nextDisabled = disabled

    for (const id of customIds) {
        if (personalKb.some((item) => item.id === id)) continue
        const entries = nextDisabled.filter((key) => key.startsWith(`${id}|`))
        if (!entries.length) continue
        nextDisabled = nextDisabled.filter((key) => !key.startsWith(`${id}|`))
    }

    if (nextDisabled.length === disabled.length) return layer
    return {...layer, disabledKeybindingKeys: nextDisabled}
}

function mergeStoredPersonalLayers(...layers: SqlEditorShortcutsLayer[]): SqlEditorShortcutsLayer {
    const nonEmpty = layers.filter(sqlEditorShortcutsLayerHasOverrides)
    if (nonEmpty.length === 0) return {}
    if (nonEmpty.length === 1) return nonEmpty[0]!

    const snippetMap = new Map<string, SqlSnippetConfig>()
    let merged: SqlEditorShortcutsLayer = {}
    for (const layer of nonEmpty) {
        for (const snippet of layer.snippets ?? []) {
            snippetMap.set(snippet.id ?? snippet.label, snippet)
        }
        merged = normalizeSqlEditorShortcutsLayer({
            ...merged,
            ...layer,
        })
    }
    if (snippetMap.size) merged.snippets = [...snippetMap.values()]

    const settings = mergeSqlEditorShortcutsLayers([merged])
    return normalizeSqlEditorShortcutsLayer({
        autoTableAlias: settings.autoTableAlias,
            showHintQuickChips: settings.showHintQuickChips,
            showHintBar: settings.showHintBar,
        showSuggestDetails: settings.showSuggestDetails,
        showColumnCommentInSuggest: settings.showColumnCommentInSuggest,
        folding: settings.folding,
        showRunGutterButton: settings.showRunGutterButton,
        locale: settings.locale,
        fontSize: settings.fontSize,
        theme: settings.theme,
        formatter: settings.formatter,
        disabledQuickChipIds: settings.disabledQuickChipIds,
        quickChips: settings.quickChips,
        snippets: merged.snippets,
        keybindings: settings.keybindings,
        disabledKeybindingKeys: settings.disabledKeybindingKeys,
        ai: settings.ai,
    })
}

/** 将旧版 dw-cli personal 键合并进 canonical 键（幂等） */
export function migrateLegacyPersonalSqlEditorStorageOnce(): void {
    if (typeof localStorage === 'undefined') return
    if (localStorage.getItem(LEGACY_PERSONAL_SHORTCUTS_KEY) === null) return

    const legacy = readRawPersonalLayer(LEGACY_PERSONAL_SHORTCUTS_KEY)
    const canonical = readRawPersonalLayer(SQL_EDITOR_PERSONAL_SETTINGS_KEY)
    const merged = mergeStoredPersonalLayers(legacy, canonical)

    if (!sqlEditorShortcutsLayerHasOverrides(merged)) {
        clearPersonalSqlEditorLayer()
    } else {
        localStorage.setItem(SQL_EDITOR_PERSONAL_SETTINGS_KEY, JSON.stringify(merged))
    }
    localStorage.removeItem(LEGACY_PERSONAL_SHORTCUTS_KEY)
}

export function hasStoredPersonalConfig(): boolean {
    if (typeof localStorage === 'undefined') return false
    migrateLegacyPersonalSqlEditorStorageOnce()
    return localStorage.getItem(SQL_EDITOR_PERSONAL_SETTINGS_KEY) !== null
}

export function readPersonalSqlEditorLayer(): SqlEditorShortcutsLayer {
    migrateLegacyPersonalSqlEditorStorageOnce()
    return readRawPersonalLayer(SQL_EDITOR_PERSONAL_SETTINGS_KEY)
}

export function writePersonalSqlEditorLayer(layer: SqlEditorShortcutsLayer): void {
    if (typeof localStorage === 'undefined') return
    const normalized = normalizeSqlEditorShortcutsLayer(layer)
    if (!sqlEditorShortcutsLayerHasOverrides(normalized)) {
        clearPersonalSqlEditorLayer()
        return
    }
    localStorage.setItem(SQL_EDITOR_PERSONAL_SETTINGS_KEY, JSON.stringify(normalized))
}

export function clearPersonalSqlEditorLayer(): void {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(SQL_EDITOR_PERSONAL_SETTINGS_KEY)
}
