import {nextTick, ref} from 'vue'
import {formatAiErrorMessage} from '@/features/ai/shared/utils/ai-error'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {t} from '@/i18n'
import type {AiPreferences} from '@/shared/config/app-config.types'
import {sqlApi} from '@/api'
import {
    buildAiPromptWithTableContext,
    extractAiTableMentions,
} from '@/features/workspace/services/ai-table-mention.service'

export interface ConsoleAiSqlResult {
    prompt: string
    sql: string
}

/** AI 输入条：打开 / 关闭 / 提交 / 快捷—*/
export function useAiPromptPanel(
    onApplySql: (result: ConsoleAiSqlResult) => void,
    options?: {
        resolveRequest?: () => Promise<{
            connectionId?: string
            database?: string
            prefs?: AiPreferences
        } | undefined>
    },
) {
    const toast = useAppToast()
    const entitlement = useEntitlementStore()
    const visible = ref(false)
    const prompt = ref('')
    const generating = ref(false)
    const panelRef = ref<{ focus?: () => void }>()
    const btnRef = ref<HTMLElement>()

    async function open(prefill?: string) {
        visible.value = true
        if (prefill) prompt.value = prefill
        await nextTick()
        panelRef.value?.focus?.()
    }

    async function toggle() {
        if (visible.value) {
            visible.value = false
            return
        }
        await open()
    }

    function close() {
        visible.value = false
    }

    async function submit() {
        const text = prompt.value.trim()
        if (!text || generating.value) return

        generating.value = true
        try {
            const request = await options?.resolveRequest?.()
            const mentions = extractAiTableMentions(text)
            const promptForModel = buildAiPromptWithTableContext(text, mentions)
            const sql = await sqlApi.generateFromPrompt(promptForModel, {
                connectionId: request?.connectionId,
                database: request?.database,
                prefs: request?.prefs,
            })
            onApplySql({prompt: text, sql})
            prompt.value = ''
            visible.value = false
            // §1.2 Wave 35: first free-tier SQL success → unlock pitch.
            if (entitlement.noteAiSqlGenerateSuccess()) {
            }
        } catch (error) {
            toast.error(formatAiErrorMessage(error))
        } finally {
            generating.value = false
        }
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault()
            void submit()
        }
        if (e.key === 'Escape') {
            visible.value = false
        }
    }

    return {
        visible,
        prompt,
        generating,
        panelRef,
        btnRef,
        open,
        toggle,
        close,
        submit,
        onKeydown,
    }
}
