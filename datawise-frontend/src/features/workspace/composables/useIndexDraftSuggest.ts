import {ref} from 'vue'
import type {DbType} from '@/core/types'
import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {buildExplainIndexDraftSql} from '@/features/workspace/services/index-suggestion.service'

export interface IndexDraftSuggestPayload {
    sql: string
    explainPlan?: ExplainPlanNode[]
    /** 仅生成该表的草稿（来自单条风险提示） */
    table?: string
}

export interface UseIndexDraftSuggestOptions {
    getConnectionId: () => string | undefined
    getDatabase: () => string | undefined
    getDbType: () => DbType | undefined
    openConsole: (options: {
        connectionId?: string
        database?: string
        sql?: string
        title?: string
    }) => Promise<string | void>
    buildConsoleTitle: () => string
    emptyMessage: () => string
}

/**
 * EXPLAIN 风险提示 → 启发式 CREATE INDEX 草稿预览 → 新开 Console Tab。
 * 不依赖 AI 插件；与 useAiIndexSuggest 互补。
 */
export function useIndexDraftSuggest(options: UseIndexDraftSuggestOptions) {
    const toast = useAppToast()
    const dialogOpen = ref(false)
    const originalSql = ref('')
    const suggestedSql = ref('')

    function requestDraft(payload: IndexDraftSuggestPayload) {
        const sql = payload.sql.trim()
        if (!sql) return
        const nodes = payload.explainPlan ?? []
        const draftSql = buildExplainIndexDraftSql(
            nodes,
            sql,
            options.getDbType(),
            options.getDatabase(),
            payload.table,
        ).trim()
        if (!draftSql || draftSql === '-- No index suggestions') {
            toast.error(options.emptyMessage())
            return
        }
        originalSql.value = sql
        suggestedSql.value = draftSql.endsWith('\n') ? draftSql : `${draftSql}\n`
        dialogOpen.value = true
    }

    async function applyDraft() {
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
        requestDraft,
        applyDraft,
    }
}
