import {computed, watchEffect} from 'vue'
import {storeToRefs} from 'pinia'
import type * as monaco from 'monaco-editor'
import {resolveSqlEditorMonacoOptions} from '@datawise/sql-editor/constants/editor-options'
import type {SqlEditorGlobalConfig} from '@datawise/sql-editor/types'
import {useEditorSettingsStore} from '@/features/settings/stores/editor-settings'
import {useSqlEditorShortcutsStore} from '@/features/settings/stores/sql-editor-shortcuts-store'
import {
    EDITOR_THEME_OPTIONS,
    type EditorThemeId,
} from '@/features/settings/constants/editor-presets'
import {ensureMonacoThemes, applyEditorTheme} from '@/features/settings/services/editor-settings.service'
import {
    buildMinimapOptions,
    toMonacoAppearanceOptions,
} from '@/features/settings/services/editor-settings.service'

/**
 * DataWise host bridge: editor appearance + snippet store → SqlEditor runtime.
 * Returns config for installSqlEditorPlugin.
 */
export function useDatawiseSqlEditorHost(): SqlEditorGlobalConfig {
    const editorSettings = useEditorSettingsStore()
    useSqlEditorShortcutsStore()
    const {settings} = storeToRefs(editorSettings)

    let monacoThemesReady = false
    const scheduleThemeSync = () => {
        const theme = settings.value.theme
        if (!monacoThemesReady) {
            monacoThemesReady = true
            const apply = () => {
                ensureMonacoThemes()
                applyEditorTheme(theme)
            }
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(apply, {timeout: 4000})
            } else {
                window.setTimeout(apply, 0)
            }
            return
        }
        applyEditorTheme(theme)
    }

    watchEffect(() => {
        scheduleThemeSync()
    })

    const theme = computed(() => settings.value.theme)

    const monacoOptions = computed((): monaco.editor.IStandaloneEditorConstructionOptions => {
        const base = toMonacoAppearanceOptions(editorSettings.settings)
        return resolveSqlEditorMonacoOptions({
            fontFamily: base.fontFamily,
            fontSize: base.fontSize,
            lineHeight: base.lineHeight,
            lineNumbers: base.lineNumbers,
            minimap: buildMinimapOptions(editorSettings.settings.minimap),
            wordWrap: base.wordWrap,
            folding: base.folding,
            foldingHighlight: base.foldingHighlight,
            showFoldingControls: base.showFoldingControls,
        })
    })

    function setTheme(next: string) {
        if (!EDITOR_THEME_OPTIONS.includes(next as EditorThemeId)) return
        editorSettings.patchSettings({theme: next as EditorThemeId})
    }

    return {
        theme,
        monacoOptions: () => monacoOptions.value,
        setTheme,
    }
}
