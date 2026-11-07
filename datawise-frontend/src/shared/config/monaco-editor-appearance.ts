import * as monaco from 'monaco-editor'
import type {EditorSettings, EditorThemeId} from '@/shared/config/editor-presets'
import {applyMonacoTheme, ensureMonacoThemes} from '@/shared/config/monaco-themes'
import {
    persistEditorSettings,
    readStoredEditorSettings,
} from '@/shared/config/editor-settings-storage'

export {ensureMonacoThemes, applyMonacoTheme}
export {persistEditorSettings, readStoredEditorSettings}

export function applyEditorTheme(theme: EditorThemeId) {
    applyMonacoTheme(theme)
}

export function buildMinimapOptions(enabled: boolean): monaco.editor.IEditorMinimapOptions {
    if (!enabled) return {enabled: false}
    return {
        enabled: true,
        side: 'right',
        size: 'proportional',
        scale: 1,
        maxColumn: 120,
        showSlider: 'always',
        renderCharacters: true,
        showRegionSectionHeaders: false,
    }
}

/** 仅外观：主题、字体、行号等；不含 suggest / wordBasedSuggestions（由 SQL 编辑器包统一） */
export function toMonacoAppearanceOptions(
    settings: EditorSettings,
): monaco.editor.IStandaloneEditorConstructionOptions {
    return {
        theme: settings.theme,
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        lineNumbers: settings.lineNumbers ? 'on' : 'off',
        minimap: buildMinimapOptions(settings.minimap),
        wordWrap: settings.wordWrap ? 'on' : 'off',
        folding: settings.folding,
        foldingHighlight: settings.folding,
        // Match SQL editor: controls on gutter hover (not always-visible clutter).
        showFoldingControls: settings.folding ? 'mouseover' : 'never',
    }
}
