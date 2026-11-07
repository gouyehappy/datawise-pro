import {onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {sqlApi} from '@/api'
import type {SqlSessionStatus} from '@/shared/api/types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {
    canBeginTransaction,
    canCommitOrRollback,
    DEFAULT_SQL_SESSION_STATUS,
    resolveTransactionErrorMessage,
    resolveTransactionScopeKey,
} from '@/features/workspace/services/transaction-mode.service'
import {registerConnectionHealthCheck} from '@/features/explorer/services/register-connection-health.service'

export function useConsoleTransaction(options: {
    sessionKey: () => string
    connectionId: () => string | undefined
    database: () => string | undefined
}) {
    const {t} = useI18n()
    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()
    const status = ref<SqlSessionStatus>({...DEFAULT_SQL_SESSION_STATUS})
    const loading = ref(false)
    let scopeKey = ''

    function sessionOptions() {
        const connectionId = options.connectionId()
        if (!connectionId) return null
        return {
            sessionKey: options.sessionKey(),
            connectionId,
            database: options.database(),
        }
    }

    async function refreshStatus() {
        const payload = sessionOptions()
        if (!payload) {
            status.value = {...DEFAULT_SQL_SESSION_STATUS}
            return
        }
        try {
            status.value = await sqlApi.fetchSessionStatus(payload.sessionKey)
        } catch {
            status.value = {...DEFAULT_SQL_SESSION_STATUS}
        }
    }

    async function runAction(action: () => Promise<SqlSessionStatus>, successKey: string) {
        const payload = sessionOptions()
        if (!payload) {
            workspace.setStatus(t('console.transaction.connectionRequired'))
            return
        }
        loading.value = true
        try {
            status.value = await action()
            const connectionId = payload.connectionId
            if (connectionId) {
                registerConnectionHealthCheck(connectionId, 'ok')
            }
            layout.showSuccessToast(t(successKey))
        } catch (error) {
            layout.showErrorToast(resolveTransactionErrorMessage(error, t))
            await refreshStatus()
        } finally {
            loading.value = false
        }
    }

    function begin() {
        const payload = sessionOptions()
        if (!payload) return
        void runAction(() => sqlApi.beginSession(payload), 'console.transaction.beginDone')
    }

    function commit() {
        const payload = sessionOptions()
        if (!payload) return
        void runAction(() => sqlApi.commitSession(payload), 'console.transaction.commitDone')
    }

    function rollback() {
        const payload = sessionOptions()
        if (!payload) return
        void runAction(() => sqlApi.rollbackSession(payload), 'console.transaction.rollbackDone')
    }

    function toggleAutocommit() {
        const payload = sessionOptions()
        if (!payload) return
        const next = !status.value.autocommit
        void runAction(
            () => sqlApi.setSessionAutocommit({...payload, autocommit: next}),
            next ? 'console.transaction.autocommitOn' : 'console.transaction.autocommitOff',
        )
    }

    async function closeSession() {
        try {
            await sqlApi.closeSession(options.sessionKey())
        } catch {
            // ignore cleanup errors
        }
        status.value = {...DEFAULT_SQL_SESSION_STATUS}
    }

    watch(
        () => resolveTransactionScopeKey(options.connectionId(), options.database()),
        async (nextKey) => {
            if (scopeKey && scopeKey !== nextKey) {
                await closeSession()
            }
            scopeKey = nextKey
            await refreshStatus()
        },
        {immediate: true},
    )

    onUnmounted(() => {
        void closeSession()
    })

    return {
        status,
        loading,
        refreshStatus,
        begin,
        commit,
        rollback,
        toggleAutocommit,
        canBegin: () => canBeginTransaction(status.value, options.connectionId()),
        canCommit: () => canCommitOrRollback(status.value),
        canRollback: () => canCommitOrRollback(status.value),
    }
}
