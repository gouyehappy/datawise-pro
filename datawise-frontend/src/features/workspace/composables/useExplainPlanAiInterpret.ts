import {ref} from 'vue'
import type {DbType} from '@/core/types'
import {buildAiWorkContext} from '@/features/ai/work-context/ai-work-context.service'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'
import {formatAiErrorMessage} from '@/features/ai/shared/utils/ai-error'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'
import {
    formatExplainPlanInterpretPrompt,
} from '@/features/workspace/services/explain-plan-ai.service'
import type {AiPreferences} from '@/shared/config/app-config.types'
import {aiApi} from '@/api'
import {currentLocale} from '@/i18n'

export interface ExplainPlanInterpretRequest {
    sql: string
    explainPlan: ExplainPlanNode[]
    explainMode?: 'estimate' | 'analyze'
}

export interface UseExplainPlanAiInterpretOptions {
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

/** EXPLAIN 计划 → AI 自然语言解读 */
export function useExplainPlanAiInterpret(options: UseExplainPlanAiInterpretOptions) {
    const toast = useAppToast()
    const interpretOpen = ref(false)
    const interpretText = ref('')
    const loading = ref(false)

    async function interpret(payload: ExplainPlanInterpretRequest) {
        if (loading.value) return
        const sql = payload.sql.trim()
        if (!sql || !payload.explainPlan.length) return

        const context = buildAiWorkContext({
            connectionId: options.getConnectionId(),
            database: options.getDatabase(),
            dbType: options.getDbType(),
            connectionLabel: options.getConnectionLabel(),
            sql,
        })

        loading.value = true
        interpretOpen.value = true
        interpretText.value = ''

        try {
            const prompt = formatExplainPlanInterpretPrompt(
                {
                    sql,
                    nodes: payload.explainPlan,
                    dbType: options.getDbType(),
                    explainMode: payload.explainMode,
                },
                currentLocale.value,
            )
            const reply = await aiApi.generateReply(prompt, {
                targets: buildAiTargets(context),
                aiPreferences: options.resolveAiPrefs(),
            })
            interpretText.value = reply.reply?.trim() || ''
            if (!interpretText.value) {
                toast.error(formatAiErrorMessage(new Error('Empty AI response')))
                interpretOpen.value = false
            }
        } catch (error) {
            toast.error(formatAiErrorMessage(error))
            interpretOpen.value = false
        } finally {
            loading.value = false
        }
    }

    function closeInterpret() {
        interpretOpen.value = false
    }

    return {
        interpretOpen,
        interpretText,
        loading,
        interpret,
        closeInterpret,
    }
}
