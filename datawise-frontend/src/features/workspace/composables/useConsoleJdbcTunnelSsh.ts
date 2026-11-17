import {ref, watch, type Ref} from 'vue'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import {isJdbcSshTunnelEnabled} from '@/features/ssh/services/ssh-jdbc-tunnel.service'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useExplorerStore} from '@/features/explorer/stores/explorer'

export type ConsoleJdbcTunnelSshDeps = {
  connectionId: Ref<string>
  tabConnectionId: () => string | undefined
  connectionLabel: () => string | undefined
}

/** JDBC SSH tunnel toolbar affordance: detect config + open terminal. */
export function useConsoleJdbcTunnelSsh(deps: ConsoleJdbcTunnelSshDeps) {
  const workspace = useWorkspaceStore()
  const explorer = useExplorerStore()
  const jdbcTunnelSshEnabled = ref(false)

  watch(
    () => deps.connectionId.value || deps.tabConnectionId(),
    (connId) => {
      if (!connId) {
        jdbcTunnelSshEnabled.value = false
        return
      }
      void fetchConnectionConfig(connId)
        .then((config) => {
          jdbcTunnelSshEnabled.value = isJdbcSshTunnelEnabled(config)
        })
        .catch(() => {
          jdbcTunnelSshEnabled.value = false
        })
    },
    {immediate: true},
  )

  function openJdbcTunnelSshTerminal() {
    const connId = deps.connectionId.value || deps.tabConnectionId()
    if (!connId) return
    workspace.openSshTerminal({
      connectionId: connId,
      connectionName: deps.connectionLabel() ?? explorer.findNode(connId)?.label ?? connId,
      explorerNodeId: connId,
    })
  }

  return {jdbcTunnelSshEnabled, openJdbcTunnelSshTerminal}
}
