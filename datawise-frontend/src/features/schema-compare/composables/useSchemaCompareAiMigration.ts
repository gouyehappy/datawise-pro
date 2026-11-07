import {ref} from 'vue'
import {aiApi} from '@/api'
import {formatAiErrorMessage} from '@/features/ai/shared/utils/ai-error'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'
import {
    buildSchemaCompareAiMigrationPrompt,
    formatSchemaCompareDiffSummary,
    parseSchemaCompareAiMigrationReply,
    type SchemaCompareAiMigrationSuggestion,
} from '@/features/schema-compare/services/schema-compare-ai-migration.service'
import type {SchemaCompareResult, SchemaScope} from '@/features/schema-compare/types/schema-compare.types'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import type {AiPreferences} from '@/shared/config/app-config.types'
import {currentLocale} from '@/i18n'

export interface UseSchemaCompareAiMigrationOptions {
    getLeftScope: () => SchemaScope | null
    getRightScope: () => SchemaScope | null
    getResult: () => SchemaCompareResult | null
    getBaselineDdl: () => string
    getSelectedTables: () => ReadonlySet<string>
    getSelectedColumnsByTable: () => ReadonlyMap<string, ReadonlySet<string>>
    resolveAiPrefs: () => AiPreferences
}

function buildTarget(target: SchemaScope): AiDatabaseTarget {
    return {
        id: `${target.connectionId}:${target.database}`,
        connectionId: target.connectionId,
        connectionLabel: target.connectionLabel,
        databaseId: target.database,
        databaseLabel: target.database,
        level: 'database',
        dbType: target.dbType,
        groupLabel: '',
    }
}

export function useSchemaCompareAiMigration(options: UseSchemaCompareAiMigrationOptions) {
    const toast = useAppToast()
    const dialogOpen = ref(false)
    const loading = ref(false)
    const baselineDdl = ref('')
    const suggestion = ref<SchemaCompareAiMigrationSuggestion | null>(null)
    const appliedUpDdl = ref<string | null>(null)

    async function suggestMigration() {
        const left = options.getLeftScope()
        const right = options.getRightScope()
        const result = options.getResult()
        const baseline = options.getBaselineDdl().trim()
        if (!left || !right || !result || !baseline) return
        if (loading.value) return

        loading.value = true
        baselineDdl.value = baseline
        suggestion.value = null
        dialogOpen.value = true

        try {
            const diffSummary = formatSchemaCompareDiffSummary(
                result,
                options.getSelectedTables(),
                options.getSelectedColumnsByTable(),
            )
            const prompt = buildSchemaCompareAiMigrationPrompt({
                left,
                right,
                baselineDdl: baseline,
                diffSummary,
                locale: currentLocale.value,
            })
            const reply = await aiApi.generateReply(prompt, {
                targets: [buildTarget(right)],
                aiPreferences: options.resolveAiPrefs(),
            })
            const parsed = parseSchemaCompareAiMigrationReply(reply.reply?.trim() ?? '')
            if (!parsed?.up.trim()) {
                dialogOpen.value = false
                toast.error(formatAiErrorMessage(new Error('Empty AI migration response')))
                return
            }
            suggestion.value = parsed
        } catch (error) {
            dialogOpen.value = false
            toast.error(formatAiErrorMessage(error))
        } finally {
            loading.value = false
        }
    }

    function applySuggestion() {
        const up = suggestion.value?.up.trim()
        if (!up) return
        appliedUpDdl.value = up
        dialogOpen.value = false
    }

    function clearAppliedMigration() {
        appliedUpDdl.value = null
    }

    return {
        dialogOpen,
        loading,
        baselineDdl,
        suggestion,
        appliedUpDdl,
        suggestMigration,
        applySuggestion,
        clearAppliedMigration,
    }
}
