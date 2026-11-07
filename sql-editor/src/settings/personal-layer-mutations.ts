import {clampSqlEditorFontSize, normalizeSqlEditorFormatterLayer} from '@sql-editor/config/formatter-settings'
import {normalizeSqlEditorThemeId} from '@sql-editor/constants/editor-themes'
import {normalizeSqlEditorLocale} from '@sql-editor/i18n'
import {keybindingEntryKey, normalizeKeyChord, parseKeyChord} from '@sql-editor/editor/shortcut-config'
import type {
    SqlCompletionSlot,
    SqlEditorLocale,
    SqlEditorShortcutsLayer,
    SqlEditorShortcutsSettings,
    SqlKeybindingConfig,
    SqlSnippetConfig,
} from '@sql-editor/types'

export function patchPersonalSqlEditorLayer(
    layer: SqlEditorShortcutsLayer,
    patch: Partial<SqlEditorShortcutsSettings>,
): SqlEditorShortcutsLayer {
    const next = {...layer}
    if (typeof patch.autoTableAlias === 'boolean') next.autoTableAlias = patch.autoTableAlias
    if (typeof patch.showHintQuickChips === 'boolean') next.showHintQuickChips = patch.showHintQuickChips
    if (typeof patch.showHintBar === 'boolean') next.showHintBar = patch.showHintBar
    if (typeof patch.showSuggestDetails === 'boolean') next.showSuggestDetails = patch.showSuggestDetails
    if (typeof patch.showColumnCommentInSuggest === 'boolean') {
        next.showColumnCommentInSuggest = patch.showColumnCommentInSuggest
    }
    if (typeof patch.folding === 'boolean') next.folding = patch.folding
    if (typeof patch.showRunGutterButton === 'boolean') {
        next.showRunGutterButton = patch.showRunGutterButton
    }
    const fontSize = clampSqlEditorFontSize(patch.fontSize)
    if (fontSize !== undefined) next.fontSize = fontSize
    if (patch.formatter) {
        next.formatter = normalizeSqlEditorFormatterLayer({
            ...next.formatter,
            ...patch.formatter,
        })
    }
    if (patch.locale) next.locale = normalizeSqlEditorLocale(patch.locale) as SqlEditorLocale
    const theme = normalizeSqlEditorThemeId(patch.theme)
    if (theme) next.theme = theme
    if (patch.ai) {
        next.ai = {...(next.ai ?? {}), ...patch.ai}
    }
    return next
}

export function setPersonalQuickChipEnabled(
    layer: SqlEditorShortcutsLayer,
    chipId: string,
    enabled: boolean,
): SqlEditorShortcutsLayer {
    const disabled = new Set(layer.disabledQuickChipIds ?? [])
    if (enabled) disabled.delete(chipId)
    else disabled.add(chipId)
    return {...layer, disabledQuickChipIds: [...disabled]}
}

export function upsertPersonalLayerSnippet(
    layer: SqlEditorShortcutsLayer,
    id: string,
    patch: Partial<SqlSnippetConfig>,
    fallback?: SqlSnippetConfig,
): SqlEditorShortcutsLayer {
    const current = layer.snippets?.find((item) => item.id === id)
    const nextItem = {
        ...(current ?? fallback ?? {
            id,
            label: id,
            insertText: '',
            detail: '',
            enabled: true,
            slots: ['statement_start'] as SqlCompletionSlot[],
        }),
        ...patch,
        id,
    }
    const others = (layer.snippets ?? []).filter((item) => item.id !== id)
    return {...layer, snippets: [...others, nextItem]}
}

export function removePersonalLayerSnippet(
    layer: SqlEditorShortcutsLayer,
    id: string,
): SqlEditorShortcutsLayer | null {
    if (!layer.snippets?.some((item) => item.id === id)) return null
    return {
        ...layer,
        snippets: layer.snippets.filter((item) => item.id !== id),
    }
}

export function setPersonalKeybindingEnabled(
    layer: SqlEditorShortcutsLayer,
    binding: SqlKeybindingConfig,
    enabled: boolean,
): SqlEditorShortcutsLayer {
    const key = keybindingEntryKey(binding)
    const disabled = new Set(layer.disabledKeybindingKeys ?? [])
    if (enabled) disabled.delete(key)
    else disabled.add(key)
    return {...layer, disabledKeybindingKeys: [...disabled]}
}

export function updatePersonalKeybindingKeys(
    layer: SqlEditorShortcutsLayer,
    binding: SqlKeybindingConfig,
    keys: string,
): { layer: SqlEditorShortcutsLayer; ok: boolean } {
    const normalized = normalizeKeyChord(keys.trim())
    if (!normalized || parseKeyChord(normalized) === null) {
        return {layer, ok: false}
    }
    if (normalized === normalizeKeyChord(binding.keys)) {
        return {layer, ok: true}
    }

    const entryKey = keybindingEntryKey(binding)
    const disabled = new Set(layer.disabledKeybindingKeys ?? [])
    disabled.add(entryKey)
    const others = (layer.keybindings ?? []).filter(
        (item) => keybindingEntryKey(item) !== entryKey,
    )
    return {
        ok: true,
        layer: {
            ...layer,
            disabledKeybindingKeys: [...disabled],
            keybindings: [
                ...others,
                {...binding, keys: normalized, enabled: true},
            ],
        },
    }
}
