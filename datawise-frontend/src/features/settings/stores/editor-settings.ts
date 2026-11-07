import {defineStore} from 'pinia'
import {useEditorSettingsState} from '@/shared/config/editor-settings-state'

/** Pinia façade over shared editor settings (Monaco + features both sync here). */
export const useEditorSettingsStore = defineStore('editorSettings', () => {
    const state = useEditorSettingsState()
    state.syncEditorSettings()

    return {
        settings: state.settings,
        patchSettings: state.patchSettings,
        syncEditorSettings: state.syncEditorSettings,
        replaceSettings: state.replaceSettings,
        syncFromStorage: state.syncFromStorage,
    }
})
