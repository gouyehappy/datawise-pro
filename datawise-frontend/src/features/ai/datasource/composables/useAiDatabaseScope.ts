import {computed, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {formatTargetLabel} from '@/features/ai/shared/utils/database-targets'
import {
    type AiTaggedScopeContext,
    useAiTaggedScopeContext,
} from '@/features/ai/datasource/composables/ai-tagged-scope.context'
import {useAiChatStore, type AiChatStore} from '@/features/ai/stores/ai-chat'

/** AI 聊天：基于已打标表的数据范围选择 */
export function useAiDatabaseScope(scope?: AiTaggedScopeContext, chatStore?: AiChatStore) {
    const aiChat = chatStore ?? useAiChatStore()
    const {activeSession} = storeToRefs(aiChat)
    const {allTargets} = scope ?? useAiTaggedScopeContext()

    const selectedTargetIds = computed({
        get: () => activeSession.value?.selectedTargetIds ?? [],
        set: (ids: string[]) => aiChat.setSelectedTargetIds(ids),
    })

    const selectedTargets = computed(() =>
        allTargets.value.filter((target) => selectedTargetIds.value.includes(target.id)),
    )

    // Drop selections that point at deleted connections / untagged tables so Agent reopen stays clean.
    watch(
        allTargets,
        (targets) => {
            const session = activeSession.value
            if (!session?.selectedTargetIds?.length) return
            const valid = new Set(targets.map((target) => target.id))
            const next = session.selectedTargetIds.filter((id) => valid.has(id))
            if (next.length !== session.selectedTargetIds.length) {
                aiChat.setSelectedTargetIds(next)
            }
        },
        {flush: 'post'},
    )

    function removeTarget(id: string) {
        selectedTargetIds.value = selectedTargetIds.value.filter((item) => item !== id)
    }

    return {
        allTargets,
        selectedTargetIds,
        selectedTargets,
        removeTarget,
        formatTargetLabel,
    }
}
