import {computed} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import {useConsoleConnectionContext} from '@/features/workspace/composables/useConsoleConnectionContext'
import {useConsoleJdbcTunnelSsh} from '@/features/workspace/composables/useConsoleJdbcTunnelSsh'
import {useConsoleRecentQueriesSync} from '@/features/workspace/composables/useConsoleRecentQueriesSync'
import {useConsoleConnectionWriteGuard} from '@/features/workspace/composables/useConsoleConnectionWriteGuard'
import {useConnectionCapabilities} from '@/features/datasource/composables/useConnectionCapabilities'
import {useProductionPerfMode} from '@/features/settings/composables/useProductionPerfMode'
import {normalizeConnectionEnvironment} from '@/features/connection/services/connection-environment.service'
import {resolveConsoleInstanceLabel, buildExplorerScopedLabelResolver} from '@/features/workspace/services/resolve-console-instance'
import {useExplorerStore} from '@/features/explorer/stores/explorer'

/** Connection / instance / env / caps / write-guard context for SqlConsoleTab. */
export function useSqlConsoleTabContext(tab: WorkspaceTab) {
  const explorer = useExplorerStore()

  const {connectionId, instanceId, dataSources, source, activeInstance, workspaceBound} =
    useConsoleConnectionContext(tab)

  const {jdbcTunnelSshEnabled, openJdbcTunnelSshTerminal} = useConsoleJdbcTunnelSsh({
    connectionId,
    tabConnectionId: () => tab.connectionId,
    connectionLabel: () => source.value?.label,
  })

  const databaseName = computed(() => {
    return resolveConsoleInstanceLabel({
      activeInstanceLabel: activeInstance.value?.label,
      instanceId: instanceId.value,
      tabInstanceId: tab.instanceId,
      tabDatabase: tab.database,
      findNodeLabel: (nodeId) => explorer.findNode(nodeId)?.label,
      resolveScopedLabel: buildExplorerScopedLabelResolver(explorer.tree, (nodeId) => explorer.findNode(nodeId)),
    })
  })

  const dbDialect = computed(() => source.value?.dbType)

  useConsoleRecentQueriesSync({
    connectionId,
    tabConnectionId: () => tab.connectionId,
    databaseName,
  })

  const connectionEnvironment = computed(() => {
    const connId = connectionId.value || tab.connectionId
    if (!connId) return normalizeConnectionEnvironment(null, null).env
    const node = explorer.findNode(connId)
    return normalizeConnectionEnvironment(node?.env, node?.envCustom).env
  })

  const {productionPerfActive} = useProductionPerfMode(() => connectionId.value || tab.connectionId)
  const {caps: connectionCaps, hint: capabilityHint} = useConnectionCapabilities(dbDialect)
  const {connectionWriteGuard} = useConsoleConnectionWriteGuard(connectionId, () => tab.connectionId)

  return {
    connectionId,
    instanceId,
    dataSources,
    source,
    activeInstance,
    workspaceBound,
    jdbcTunnelSshEnabled,
    openJdbcTunnelSshTerminal,
    databaseName,
    dbDialect,
    connectionEnvironment,
    productionPerfActive,
    connectionCaps,
    capabilityHint,
    connectionWriteGuard,
  }
}
