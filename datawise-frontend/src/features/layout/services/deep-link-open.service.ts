import {t} from '@/i18n'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {DeepLinkOpenPayload} from '@/shared/deep-link/deep-link.types'
import type {DbType} from '@/core/types'

export async function applyDeepLinkOpen(payload: DeepLinkOpenPayload): Promise<void> {
    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()
    const pluginStore = usePluginStore()
    const entitlement = useEntitlementStore()
    const explorer = useExplorerStore()

    try {
        switch (payload.action) {
            case 'connection-new': {
                layout.setModule('database')
                const dbType = (payload.dbType?.trim() || 'mysql') as DbType
                workspace.openConnectionForm(dbType)
                return
            }
            case 'ai': {
                if (!entitlement.guardAiNav()) return
                layout.setModule('ai')
                return
            }
            case 'plugin-install': {
                layout.setModule('connectorMarket')
                pluginStore.openConnectorMarket()
                if (payload.pluginId) {
                    pluginStore.highlightPluginId = payload.pluginId
                }
                return
            }
            case 'analysis-canvas': {
                if (!entitlement.guardAiNav()) return
                const connectionId = payload.connectionId
                    ?? explorer.tree.find((node) => node.type === 'connection')?.id
                if (!connectionId) {
                    layout.setModule('ai')
                    layout.showWarningToast(t('settings.basic.deepLink.needConnection'))
                    return
                }
                const database = payload.database
                    ?? explorer.findNode(connectionId)?.database
                    ?? ''
                layout.setModule('database')
                workspace.openPlatformCatalog({
                    feature: 'analysis_canvas',
                    connectionId,
                    database: database || connectionId,
                })
                return
            }
            case 'open':
            default: {
                layout.setModule('database')
                await workspace.openConsole({
                    connectionId: payload.connectionId,
                    database: payload.database,
                    sql: payload.sql,
                })
            }
        }
    } catch {
        layout.showErrorToast(t('settings.basic.deepLink.openFailed'))
    }
}
