import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {ensureWatchedConnectionId} from '@/features/explorer/services/connection-health-alert.service'
import {isStatelessConnector} from '@/features/explorer/services/explorer-connection-state.service'

/** 连接被实际使用后登记绿标；JDBC 另纳入周期 ping，无状态 connector 仅在实际操作时判错。 */
export function registerConnectionHealthCheck(
    connectionId: string,
    outcome: 'ok' | 'error' = 'ok',
) {
    if (!connectionId) return

    const explorer = useExplorerStore()
    const dbType = explorer.findNode(connectionId)?.dbType
    explorer.markConnectionAttempted(connectionId)
    explorer.setConnectionHealth(connectionId, outcome)
    if (isStatelessConnector(dbType)) {
        explorer.markConnectionPooled(connectionId)
    }

    const appConfig = useAppConfigStore()
    const nextWatched = ensureWatchedConnectionId(
        connectionId,
        appConfig.connectionHealthPreferences,
    )
    if (nextWatched) {
        appConfig.patchConnectionHealth({watchedConnectionIds: nextWatched})
    }
}

/** 无状态 connector 打开工作区 Tab 或 API 成功后登记为「使用中」，保留绿标。 */
export function registerStatelessConnectorUse(
    connectionId: string,
    dbType?: string | null,
    outcome: 'ok' | 'error' = 'ok',
) {
    if (!connectionId || !isStatelessConnector(dbType)) return
    registerConnectionHealthCheck(connectionId, outcome)
}
