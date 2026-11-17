import {watch, type Ref} from 'vue'
import {getActiveSqlEditorRuntime} from '@datawise/sql-editor/runtime/sql-editor-runtime'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {buildRecentQueriesFromSqlLogs} from '@/features/workspace/services/recent-sql-suggest.service'
import {sqlLogsRecentSyncKey} from '@/features/workspace/services/sql-logs-recent-sync.policy'

/** Keep Monaco recent-query suggest in sync with SQL logs + console scope. */
export function useConsoleRecentQueriesSync(deps: {
  connectionId: Ref<string>
  tabConnectionId: () => string | undefined
  databaseName: Ref<string | undefined>
}) {
  const shortcutPanel = useShortcutPanelStore()

  watch(
    () =>
      sqlLogsRecentSyncKey(
        shortcutPanel.sqlLogs,
        deps.connectionId.value || deps.tabConnectionId(),
        deps.databaseName.value,
      ),
    () => {
      const connId = deps.connectionId.value || deps.tabConnectionId()
      const database = deps.databaseName.value
      const runtime = getActiveSqlEditorRuntime()
      runtime.setRecentQueryScope({
        connectionId: connId,
        database,
      })
      runtime.setRecentQueries(
        buildRecentQueriesFromSqlLogs(shortcutPanel.sqlLogs, {
          connectionId: connId,
          database,
        }),
      )
    },
    {immediate: true},
  )
}
