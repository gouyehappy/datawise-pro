import {defineStore} from 'pinia'
import {
    type SqlEditorShortcutsSettings,
    type SqlSnippetConfig,
} from '@/features/settings/constants/sql-editor-shortcuts-presets'
import {getAppSqlEditorShortcutsController} from '@/features/settings/services/sql-editor-shortcuts.controller'

export type {SqlSnippetSource} from '@datawise/sql-editor/composables/useSqlEditorShortcutsController'

export const useSqlEditorShortcutsStore = defineStore('sqlEditorShortcuts', () => {
    const controller = getAppSqlEditorShortcutsController()

    const sharedSettings = controller.sharedLayer!
    const personalSettings = controller.personalLayer
    const pluginSettings = controller.pluginSettings
    const effectiveSettings = controller.settings
    const settings = effectiveSettings

    function applyPreferences(prefs?: Partial<SqlEditorShortcutsSettings>) {
        controller.applyPersonal(prefs)
    }

    function updateSnippet(id: string, patch: Partial<SqlSnippetConfig>) {
        controller.upsertPersonalSnippet(id, patch)
    }

    function removeSnippet(id: string) {
        controller.removePersonalSnippet(id)
    }

    function addCustomSnippet(snippet: Omit<SqlSnippetConfig, 'id' | 'builtin'> & { id?: string }) {
        if (snippet.id) {
            controller.upsertPersonalSnippet(snippet.id, snippet)
            return
        }
        controller.addCustomSnippet({
            label: snippet.label,
            insertText: snippet.insertText,
            detail: snippet.detail,
            slots: snippet.slots,
        })
    }

    return {
        sharedSettings,
        personalSettings,
        pluginSettings,
        effectiveSettings,
        settings,
        pluginSnippetCount: controller.pluginSnippetCount,
        sharedSnippetCount: controller.sharedSnippetCount,
        personalSnippetCount: controller.personalSnippetCount,
        hasSharedLayer: controller.hasSharedLayer,
        patchSettings: controller.patchSettings,
        setQuickChipEnabled: controller.setQuickChipEnabled,
        isQuickChipEnabled: controller.isQuickChipEnabled,
        updateSnippet,
        toggleSnippet: controller.toggleSnippet,
        addCustomSnippet,
        removeSnippet,
        resetPersonal: controller.resetPersonal,
        applyShared: controller.applyShared,
        applyPersonal: controller.applyPersonal,
        applyPreferences,
        importSharedConfigText: controller.importSharedConfigText,
        clearShared: controller.clearShared,
        exportSharedConfig: controller.exportSharedConfig,
        sharedSnapshot: controller.sharedSnapshot,
        personalSnapshot: controller.personalSnapshot,
        snapshot: controller.snapshot,
        snippetSource: controller.snippetSource,
        isSnippetEditable: controller.isSnippetEditable,
    }
})
