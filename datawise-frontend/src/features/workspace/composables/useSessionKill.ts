import {computed, ref, type Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import type {DbType} from '@/core/types'
import {useTeamStore} from '@/features/team/stores/team-store'
import {canDmlConnection} from '@/features/team/services/connection-access.service'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {sqlApi} from '@/api'
import type {SessionKillMode} from '@/shared/api/types'
import type {PendingSessionKill} from '@/features/workspace/composables/session-kill-context'
import {useConnectionCapabilities} from '@/features/datasource/composables/useConnectionCapabilities'

export function useSessionKill(
    connectionId: Ref<string | undefined>,
    database: Ref<string | undefined>,
    dbType: Ref<DbType | undefined>,
) {
    const {t} = useI18n()
    const teamStore = useTeamStore()
    const toast = useAppToast()
    const entitlement = useEntitlementStore()
    const {caps, hint} = useConnectionCapabilities(dbType)
    const killingSessionId = ref<string | null>(null)
    const confirmOpen = ref(false)
    const pendingKill = ref<PendingSessionKill | null>(null)

    const sessionKillSupported = computed(() => caps.value.sessionKill)

    const canKill = computed(() =>
        Boolean(connectionId.value?.trim())
        && sessionKillSupported.value
        && canDmlConnection(connectionId.value, teamStore.teams),
    )

    function requestKill(
        sessionId: string,
        mode: SessionKillMode = 'query',
        onSuccess?: () => void | Promise<void>,
    ) {
        const id = sessionId.trim()
        const connId = connectionId.value?.trim()
        if (!id || !connId) return

        if (!sessionKillSupported.value) {
            toast.show(hint('sessionKill'), {variant: 'info'})
            return
        }

        if (!canDmlConnection(connId, teamStore.teams)) {
            toast.error(t('shortcut.sessionKill.readOnly'))
            return
        }

        // §1.2 Wave 36: Kill / lock ops need DataOps — paywall before confirm.
        if (!entitlement.guardPack('pack.dataops', 'session.kill')) return

        pendingKill.value = {sessionId: id, mode, onSuccess}
        confirmOpen.value = true
    }

    function cancelKill() {
        if (killingSessionId.value) return
        confirmOpen.value = false
        pendingKill.value = null
    }

    async function confirmKill() {
        const pending = pendingKill.value
        const connId = connectionId.value?.trim()
        if (!pending || !connId) {
            cancelKill()
            return false
        }

        killingSessionId.value = pending.sessionId
        try {
            const result = await sqlApi.killSession({
                connectionId: connId,
                database: database.value,
                sessionId: pending.sessionId,
                mode: pending.mode,
            })
            if (!result.killed) {
                const stale = result.message?.includes('already ended')
                toast.show(
                    stale
                        ? t('shortcut.sessionKill.staleSession', {id: pending.sessionId})
                        : (result.message || t('shortcut.sessionKill.failed')),
                    {variant: stale ? 'info' : 'error'},
                )
                if (result.message?.includes('already ended')) {
                    confirmOpen.value = false
                    pendingKill.value = null
                    await pending.onSuccess?.()
                }
                return false
            }
            toast.success(t('shortcut.sessionKill.success', {id: pending.sessionId}))
            confirmOpen.value = false
            pendingKill.value = null
            await pending.onSuccess?.()
            return true
        } catch {
            return false
        } finally {
            killingSessionId.value = null
        }
    }

    return {
        canKill,
        sessionKillSupported,
        killingSessionId,
        confirmOpen,
        pendingKill,
        requestKill,
        confirmKill,
        cancelKill,
    }
}
