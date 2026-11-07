import {defineStore} from 'pinia'
import {ref} from 'vue'
import type {QueryResultPaneSettings} from '@/features/workspace/services/query-result-pane-settings.service'
import {
    persistQueryResultPaneSettings,
    readStoredQueryResultPaneSettings,
} from '@/features/workspace/services/query-result-pane-settings.service'

export const useQueryResultPaneSettingsStore = defineStore('queryResultPaneSettings', () => {
    const settings = ref<QueryResultPaneSettings>(readStoredQueryResultPaneSettings())

    function patchSettings(patch: Partial<QueryResultPaneSettings>) {
        settings.value = {...settings.value, ...patch}
        persistQueryResultPaneSettings(settings.value)
    }

    function toggleSortOrder() {
        patchSettings({
            sortOrder: settings.value.sortOrder === 'newest' ? 'oldest' : 'newest',
        })
    }

    return {
        settings,
        patchSettings,
        toggleSortOrder,
    }
})
