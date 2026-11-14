import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {extractSqlFromContent} from '@/features/ai/chat/services/ai-chat.service'
import type {AiConversationBinding} from '@/features/ai/types/session'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'
import {useI18n} from 'vue-i18n'
import type {Ref} from 'vue'

/**
 * 将 AI 回复中的 SQL 打开到控制台。
 * 优先使用会话 binding（T-AI-1 US-2），避免跟焦点/打标表漂移写错库。
 */
export function useAiConsoleBridge(
    selectedTargets: Ref<AiDatabaseTarget[]>,
    binding?: Ref<AiConversationBinding | null | undefined>,
) {
    const {t} = useI18n()
    const toast = useAppToast()
    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()

    function openInConsole(content: string) {
        const sql = extractSqlFromContent(content)
        if (!sql) {
            toast.error(t('ai.noSqlInReply'))
            return
        }

        const bound = binding?.value
        const target = selectedTargets.value[0]
        const connectionId = bound?.connectionId || target?.connectionId
        const connectionName = bound?.connectionName || target?.connectionLabel
        const instanceId = bound?.database
            ?? (target && target.databaseId !== '__conn__' ? target.databaseId : null)

        layout.setModule('database')
        workspace.openConsole({
            sql,
            connectionId,
            connectionName,
            instanceId,
        })

        const where = [connectionName || connectionId, bound?.database || target?.databaseLabel]
            .filter(Boolean)
            .join(' / ')
        if (where) {
            toast.success(t('ai.appliedToConsole', {target: where}))
        }
    }

    return {extractSqlFromContent, openInConsole}
}
