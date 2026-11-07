import {computed, shallowRef, type ComputedRef} from 'vue'
import type {EditorSettings} from '@/shared/config/editor-presets'
import {applyEditorTheme} from '@/shared/config/monaco-editor-appearance'
import {
    persistEditorSettings,
    readStoredEditorSettings,
} from '@/shared/config/editor-settings-storage'

const settingsRef = shallowRef<EditorSettings>(readStoredEditorSettings())

export type EditorSettingsState = {
    settings: ComputedRef<EditorSettings>
    patchSettings: (patch: Partial<EditorSettings>) => void
    replaceSettings: (next: EditorSettings) => void
    syncFromStorage: () => void
    syncEditorSettings: () => void
}

function writeSettings(next: EditorSettings, applyTheme = true) {
    settingsRef.value = next
    persistEditorSettings(next)
    if (applyTheme) applyEditorTheme(next.theme)
}

/** Shared reactive editor prefs (Pinia store + Monaco both use this). */
export function useEditorSettingsState(): EditorSettingsState {
    return {
        settings: computed(() => settingsRef.value),
        patchSettings(patch) {
            writeSettings({...settingsRef.value, ...patch})
        },
        replaceSettings(next) {
            writeSettings({...next})
        },
        syncFromStorage() {
            settingsRef.value = readStoredEditorSettings()
        },
        syncEditorSettings() {
            writeSettings({...settingsRef.value})
        },
    }
}

export function getEditorSettingsSnapshot(): EditorSettings {
    return settingsRef.value
}
