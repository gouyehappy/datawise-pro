import {ref} from 'vue'
import type {DbType} from '@/core/types'
import {buildAiWorkContext} from '@/features/ai/work-context/ai-work-context.service'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'
import {formatAiErrorMessage} from '@/features/ai/shared/utils/ai-error'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import type {QueryResultItem} from '@/features/workspace/types'
import {
    buildQueryResultSummaryPayload,
    formatQueryResultSummaryPrompt,
} from '@/features/workspace/services/query-result-ai-summary.service'
import type {AiPreferences} from '@/shared/config/app-config.types'
import {aiApi} from '@/api'
import {currentLocale} from '@/i18n'

export interface UseQueryResultAiSummaryOptions {
    getConnectionId: () => string | undefined
    getDatabase: () => string | undefined
    getDbType: () => DbType | undefined
    getConnectionLabel: () => string
    resolveAiPrefs: () => AiPreferences
}

function buildAiTargets(context: ReturnType<typeof buildAiWorkContext>): AiDatabaseTarget[] | undefined {
    if (!context.connectionId || !context.dbType) return undefined
    return [
        {
            id: `${context.connectionId}:${context.database ?? ''}`,
            connectionId: context.connectionId,
            connectionLabel: context.connectionLabel ?? context.connectionId,
            databaseId: context.database ?? context.connectionId,
            databaseLabel: context.database ?? '',
            level: context.database ? 'database' : 'connection',
            dbType: context.dbType,
            groupLabel: '',
        },
    ]
}

/** Epic D-03：结果集 AI 摘要 */
export function useQueryResultAiSummary(options: UseQueryResultAiSummaryOptions) {
    const toast = useAppToast()
    const summaryOpen = ref(false)
    const summaryText = ref('')
    const loading = ref(false)

    async function summarize(result: QueryResultItem) {
        if (loading.value) return

        const payload = buildQueryResultSummaryPayload(result)
        if (!payload) return

        const context = buildAiWorkContext({
            connectionId: options.getConnectionId(),
            database: options.getDatabase(),
            dbType: options.getDbType(),
            connectionLabel: options.getConnectionLabel(),
            sql: result.sql,
        })

        loading.value = true
        summaryOpen.value = true
        summaryText.value = ''

        try {
            const prompt = formatQueryResultSummaryPrompt(payload, currentLocale.value)
            const reply = await aiApi.generateReply(prompt, {
                targets: buildAiTargets(context),
                aiPreferences: options.resolveAiPrefs(),
            })
            summaryText.value = reply.reply?.trim() || ''
            if (!summaryText.value) {
                toast.error(formatAiErrorMessage(new Error('Empty AI response')))
                summaryOpen.value = false
            }
        } catch (error) {
            toast.error(formatAiErrorMessage(error))
            summaryOpen.value = false
        } finally {
            loading.value = false
        }
    }

    function closeSummary() {
        summaryOpen.value = false
    }

    return {
        summaryOpen,
        summaryText,
        loading,
        summarize,
        closeSummary,
    }
}
