import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useEditorSettingsStore} from '@/features/settings/stores/editor-settings'
import {resolveClientMaxResultRows} from '@/features/settings/services/query-limit.service'

export function useSqlExecutionLimitHint() {
    const {t} = useI18n()
    const editorSettings = useEditorSettingsStore()

    const maxRows = computed(() => resolveClientMaxResultRows())

    const label = computed(() => {
        const rows = maxRows.value
        if (rows <= 0) {
            return t('console.executionLimit.unlimited')
        }
        return t('console.executionLimit.maxRows', {count: rows})
    })

    const compactLabel = computed(() => {
        const rows = maxRows.value
        if (rows <= 0) {
            return t('console.executionLimit.compactUnlimited')
        }
        if (rows >= 1_000_000) {
            return t('console.executionLimit.compactMaxRows', {count: `${Math.round(rows / 1_000_000)}M`})
        }
        if (rows >= 1000) {
            return t('console.executionLimit.compactMaxRows', {count: `${Math.round(rows / 1000)}k`})
        }
        return t('console.executionLimit.compactMaxRows', {count: String(rows)})
    })

    const hint = computed(() => {
        if (maxRows.value <= 0) {
            return t('console.executionLimit.unlimitedHint')
        }
        return t('console.executionLimit.maxRowsHint')
    })

    return {
        maxRows,
        label,
        compactLabel,
        hint,
        settings: editorSettings.settings,
    }
}
