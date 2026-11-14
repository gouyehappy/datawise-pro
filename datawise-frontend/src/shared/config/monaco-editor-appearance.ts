/**
 * Monaco appearance helpers for the host app.
 * PERF-03: do not statically import `monaco-editor` / theme registration here —
 * those pull the editor into the AppShell critical path via registerCodeEditorHost.
 */
import type {editor as MonacoEditor} from 'monaco-editor'
import type {EditorSettings, EditorThemeId} from '@/shared/config/editor-presets'
import {
    persistEditorSettings,
    readStoredEditorSettings,
} from '@/shared/config/editor-settings-storage'

export {persistEditorSettings, readStoredEditorSettings}

let themesReady: Promise<void> | null = null

/** Lazy-register SQL editor Monaco themes (dynamic import — safe on cold start). */
export function ensureMonacoThemes(): Promise<void> {
    if (!themesReady) {
        themesReady = import('@/shared/config/monaco-themes')
            .then((mod) => {
                mod.ensureMonacoThemes()
            })
            .catch((error) => {
                themesReady = null
                throw error
            })
    }
    return themesReady
}

export function applyMonacoTheme(theme: EditorThemeId): void {
    void ensureMonacoThemes().then(async () => {
        const {applyMonacoTheme: apply} = await import('@/shared/config/monaco-themes')
        apply(theme)
    })
}

export function applyEditorTheme(theme: EditorThemeId): void {
    applyMonacoTheme(theme)
}

export function buildMinimapOptions(enabled: boolean): MonacoEditor.IEditorMinimapOptions {
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
): MonacoEditor.IStandaloneEditorConstructionOptions {
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
