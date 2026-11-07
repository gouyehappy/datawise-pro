import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import type {ConnectionConfig} from '@/core/types'
import type {Reactive} from 'vue'
import {isUnsavedConnectionId} from '@/features/connection/utils/connection-defaults'
import {resolveConnectionCatalogErrorMessage} from '@/features/connection/services/connection-catalog.service'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {canMutateConnectionCatalog} from '@/features/auth/services/feature-permission.service'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import type {DbType} from '@/core/types'

/** 连接 Tab：保存 / 取消 */
export function useConnectionTabActions(options: {
    tabId: string
    form: Reactive<ConnectionConfig>
    getPayload: () => ConnectionConfig
    getLabel: () => string
    editingConnectionId?: () => string | undefined
    targetGroupId?: () => string | undefined
}) {
    const {t} = useI18n()
    const explorer = useExplorerStore()
    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()
    const auth = useAuthStore()
    const entitlement = useEntitlementStore()
    const saving = ref(false)
    /** Footer 就地反馈（失败 / 无法保存）；成功关 Tab 仍用 toast */
    const actionMessage = ref<string | null>(null)
    const actionOk = ref<boolean | null>(null)
    const canSave = computed(() => canMutateConnectionCatalog(auth.isGuest))

    function setActionFeedback(message: string, ok: boolean) {
        actionMessage.value = message
        actionOk.value = ok
    }

    async function saveConnection() {
        if (saving.value) return
        if (!canSave.value) return

        const payload = options.getPayload()
        if (!entitlement.guardDbType(payload.dbType as DbType)) {
            setActionFeedback(t('connection.packRequired'), false)
            return
        }
        if (!payload.name?.trim()) {
            payload.name = `${options.getLabel()}@${payload.host || 'localhost'}`
            options.form.name = payload.name
        }

        const rawEditId = options.editingConnectionId?.()?.trim()
        const persistedEditId =
            rawEditId && !isUnsavedConnectionId(rawEditId) ? rawEditId : undefined

        saving.value = true
        actionMessage.value = null
        actionOk.value = null
        try {
            if (persistedEditId) {
                payload.id = persistedEditId
                await explorer.updateConnection(persistedEditId, payload)
                layout.showSuccessToast(t('connection.updateSuccess'))
                explorer.selectNode(persistedEditId)
                explorer.expandToNode(persistedEditId)
            } else {
                const groupId = options.targetGroupId?.()
                const id = await explorer.addConnection(payload, groupId)
                if (!id) {
                    setActionFeedback(t('connection.saveFailed'), false)
                    return
                }
                layout.showSuccessToast(t('connection.saveSuccess'))
                explorer.expandToNode(id)
                explorer.selectNode(id)
            }

            layout.setModule('database')
            workspace.closeTab(options.tabId)
        } catch (error) {
            setActionFeedback(resolveConnectionCatalogErrorMessage(error, t, 'save'), false)
        } finally {
            saving.value = false
        }
    }

    function cancel() {
        workspace.closeTab(options.tabId)
    }

    return {saveConnection, cancel, saving, canSave, actionMessage, actionOk}
}
