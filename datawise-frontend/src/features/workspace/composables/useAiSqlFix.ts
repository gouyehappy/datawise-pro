import {nextTick, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import type {DbType} from '@/core/types'
import {
    buildAiWorkContext,
    formatAiFixPrompt,
    mergeWorkbenchFocusIntoWorkContext,
} from '@/features/ai/work-context/ai-work-context.service'
import {fetchWorkbenchContext} from '@/features/ai/context/services/workbench-context.api'
import {formatAiErrorMessage} from '@/features/ai/shared/utils/ai-error'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {buildDegradedSqlErrorHint} from '@/features/workspace/services/console-ai-degraded.service'
import type {AiPreferences} from '@/shared/config/app-config.types'
import {sqlApi} from '@/api'
import {replaceConsoleSqlStatement} from '@/features/workspace/services/console-sql-replace.service'

export interface AiSqlFixPayload {
    sql: string
    errorMessage: string
    errorLine?: number
}

export interface UseAiSqlFixOptions {
    getSql: () => string
    setSql: (sql: string) => void
    focusEditorLine?: (line: number) => void
    getConnectionId: () => string | undefined
    getDatabase: () => string | undefined
    getDbType: () => DbType | undefined
    getConnectionLabel: () => string
    getSelection?: () => string | undefined
    resolveAiPrefs: () => AiPreferences
}

/** 执行失败 → AI 生成修复 SQL → diff 预览 → 应用（Epic D-02） */
export function useAiSqlFix(options: UseAiSqlFixOptions) {
    const {t} = useI18n()
    const toast = useAppToast()
    const entitlement = useEntitlementStore()
    const workspace = useWorkspaceStore()
    const fixDialogOpen = ref(false)
    const fixOriginal = ref('')
    const fixSuggested = ref('')
    const fixing = ref(false)

    async function requestFix(payload: AiSqlFixPayload) {
        if (fixing.value) return

        if (!entitlement.guardConsoleAiLite('console.ai.fix')) {
            const hintId = buildDegradedSqlErrorHint(payload.errorMessage)
            const tip = t(`console.aiDegraded.${hintId ?? 'generic'}`)
            workspace.setStatus(tip)
            toast.show(tip, {variant: 'info'})
            return
        }

        let context = buildAiWorkContext({
            connectionId: options.getConnectionId(),
            database: options.getDatabase(),
            dbType: options.getDbType(),
            connectionLabel: options.getConnectionLabel(),
            sql: payload.sql,
            selection: options.getSelection?.(),
            lastError: payload.errorMessage,
            errorLine: payload.errorLine,
        })

        fixing.value = true
        try {
            if (!context.connectionId) {
                try {
                    const focus = await fetchWorkbenchContext(false)
                    context = mergeWorkbenchFocusIntoWorkContext(context, focus)
                } catch {
                    // focus is best-effort
                }
            }
            const prompt = formatAiFixPrompt(context)
            const suggested = await sqlApi.generateFromPrompt(prompt, {
                connectionId: context.connectionId,
                database: context.database,
                prefs: options.resolveAiPrefs(),
            })
            fixOriginal.value = payload.sql.trim()
            fixSuggested.value = suggested.trim()
            if (!fixSuggested.value) {
                toast.error(formatAiErrorMessage(new Error('Empty AI response')))
                return
            }
            fixDialogOpen.value = true
        } catch (error) {
            toast.error(formatAiErrorMessage(error))
        } finally {
            fixing.value = false
        }
    }

    async function applyFix() {
        const {text, focusLine} = replaceConsoleSqlStatement(
            options.getSql(),
            fixOriginal.value,
            fixSuggested.value,
        )
        options.setSql(text)
        fixDialogOpen.value = false
        await nextTick()
        options.focusEditorLine?.(focusLine)
    }

    return {
        fixDialogOpen,
        fixOriginal,
        fixSuggested,
        fixing,
        requestFix,
        applyFix,
    }
}
