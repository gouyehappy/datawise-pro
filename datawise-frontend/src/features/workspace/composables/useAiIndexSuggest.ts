import {ref} from 'vue'
import type {DbType} from '@/core/types'
import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'
import {formatAiIndexSuggestPrompt} from '@/features/ai/work-context/ai-work-context.service'
import {formatAiErrorMessage} from '@/features/ai/shared/utils/ai-error'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import type {AiPreferences} from '@/shared/config/app-config.types'
import {sqlApi} from '@/api'
import {
    buildHeuristicIndexDrafts,
    formatIndexDraftSql,
    mergeAiIndexDraftSql,
    summarizeExplainPlan,
} from '@/features/workspace/services/index-suggestion.service'

export interface IndexSuggestPayload {
    sql: string
    explainPlan?: ExplainPlanNode[]
}

export interface UseAiIndexSuggestOptions {
    getConnectionId: () => string | undefined
    getDatabase: () => string | undefined
    getDbType: () => DbType | undefined
    getConnectionLabel: () => string
    resolveAiPrefs: () => AiPreferences
    openConsole: (options: {
        connectionId?: string
        database?: string
        sql?: string
        title?: string
    }) => Promise<string | void>
    buildConsoleTitle: () => string
}

/** EXPLAIN 计划 / 选区 SQL → AI 索引建议 → diff 预览 → 新开 Console Tab（A-06） */
export function useAiIndexSuggest(options: UseAiIndexSuggestOptions) {
    const toast = useAppToast()
    const dialogOpen = ref(false)
    const originalSql = ref('')
    const suggestedSql = ref('')
    const loading = ref(false)

    async function requestSuggest(payload: IndexSuggestPayload) {
        if (loading.value) return
        const sql = payload.sql.trim()
        if (!sql) return

        const dbType = options.getDbType()
        const database = options.getDatabase()
        const nodes = payload.explainPlan ?? []
        const heuristicDrafts = buildHeuristicIndexDrafts(nodes, sql, dbType)
        const heuristicSql = formatIndexDraftSql(heuristicDrafts, dbType, database)
        const planSummary = nodes.length ? summarizeExplainPlan(nodes, dbType) : undefined

        loading.value = true
        try {
            const prompt = formatAiIndexSuggestPrompt({
                sql,
                planSummary,
                heuristicSql,
                dbType,
                database,
            })
            let suggested = heuristicSql
            try {
                const aiResponse = await sqlApi.generateFromPrompt(prompt, {
                    connectionId: options.getConnectionId(),
                    database,
                    prefs: options.resolveAiPrefs(),
                })
                suggested = mergeAiIndexDraftSql(aiResponse, heuristicSql)
            } catch {
                suggested = heuristicSql
            }

            originalSql.value = sql
            suggestedSql.value = suggested.trim()
            if (!suggestedSql.value || suggestedSql.value === '-- No index suggestions\n') {
                toast.error(formatAiErrorMessage(new Error('No index suggestions')))
                return
            }
            dialogOpen.value = true
        } catch (error) {
            toast.error(formatAiErrorMessage(error))
        } finally {
            loading.value = false
        }
    }

    async function applySuggest() {
        const sql = suggestedSql.value.trim()
        if (!sql) return
        await options.openConsole({
            connectionId: options.getConnectionId(),
            database: options.getDatabase(),
            sql,
            title: options.buildConsoleTitle(),
        })
        dialogOpen.value = false
    }

    return {
        dialogOpen,
        originalSql,
        suggestedSql,
        loading,
        requestSuggest,
        applySuggest,
    }
}
