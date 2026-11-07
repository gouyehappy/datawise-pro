import {computed, ref, type Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {sqlApi} from '@/api'
import type {CancelConsoleSqlResult, SessionKillMode} from '@/shared/api/types'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'

export function useConsoleSqlCancel(options: {
    sessionKey: Ref<string>
    running: Ref<boolean>
    canKill: Ref<boolean>
}) {
    const {t} = useI18n()
    const toast = useAppToast()
    const workspace = useWorkspaceStore()
    const confirmOpen = ref(false)
    const pendingMode = ref<SessionKillMode>('connection')
    const cancelling = ref(false)
    /** 对话框内/连点失败时的就地错误；请求成功仍用 toast */
    const errorMessage = ref('')

    const canCancel = computed(() => options.running.value && options.canKill.value)

    function formatCancelError(error: unknown): string {
        return resolveDisplayApiErrorMessage(error, t) || t('console.cancelExecution.failed')
    }

    async function executeCancel(mode: SessionKillMode): Promise<CancelConsoleSqlResult | null> {
        if (!options.running.value) {
            errorMessage.value = t('console.cancelExecution.notRunning')
            return null
        }
        if (!options.canKill.value) {
            errorMessage.value = t('console.cancelExecution.readOnly')
            return null
        }

        cancelling.value = true
        errorMessage.value = ''
        try {
            const result = await sqlApi.cancelExecution({
                sessionKey: options.sessionKey.value,
                mode,
            })
            if (!result.cancelled) {
                errorMessage.value = result.message || t('console.cancelExecution.failed')
                return result
            }
            // Connection abort frees the slot immediately; soft cancel also drops UI run
            // state so Stop exits and in-flight apply/error toasts are ignored.
            workspace.invalidateConsoleRun(options.sessionKey.value)
            if (mode === 'connection') {
                toast.success(t('console.cancelExecution.connectionRequested'))
            } else {
                toast.success(t('console.cancelExecution.queryRequested'))
            }
            confirmOpen.value = false
            return result
        } catch (error) {
            errorMessage.value = formatCancelError(error)
            return null
        } finally {
            cancelling.value = false
        }
    }

    function cancelQueryNow() {
        if (!options.running.value) {
            errorMessage.value = t('console.cancelExecution.notRunning')
            return
        }
        void executeCancel('query')
    }

    function requestCancelConnection() {
        errorMessage.value = ''
        if (!options.canKill.value) {
            errorMessage.value = t('console.cancelExecution.readOnly')
            return
        }
        if (!options.running.value) {
            errorMessage.value = t('console.cancelExecution.notRunning')
            return
        }
        pendingMode.value = 'connection'
        confirmOpen.value = true
    }

    function closeConfirm() {
        if (cancelling.value) return
        confirmOpen.value = false
        errorMessage.value = ''
    }

    async function confirmCancel(): Promise<CancelConsoleSqlResult | null> {
        return executeCancel(pendingMode.value)
    }

    return {
        confirmOpen,
        pendingMode,
        cancelling,
        canCancel,
        errorMessage,
        cancelQueryNow,
        requestCancelConnection,
        closeConfirm,
        confirmCancel,
    }
}
