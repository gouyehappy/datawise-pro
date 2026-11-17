import {useI18n} from 'vue-i18n'
import type {Ref} from 'vue'
import type {DbType} from '@/core/types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useQueryBookmarkSave} from '@/features/workspace/composables/useQueryBookmarkSave'
import {useIndexDraftSuggest} from '@/features/workspace/composables/useIndexDraftSuggest'
import {isViewModelSelectSql} from '@/api/modules/view-model'

/** Bookmark / view-model / index-draft dialogs for the SQL console. */
export function useSqlConsoleAuxDialogs(deps: {
  tabTitle: () => string | undefined
  connectionId: () => string | undefined
  instanceId: () => string | null | undefined
  tabInstanceId: () => string | null | undefined
  databaseName: Ref<string | undefined>
  dbDialect: Ref<DbType | undefined>
  connectionLabel: () => string | undefined
  sql: Ref<string>
}) {
  const {t} = useI18n()
  const workspace = useWorkspaceStore()
  const layout = useLayoutStore()

  const {
    bookmarkDialogOpen,
    bookmarkSaving,
    bookmarkDefaults,
    openSaveBookmarkDialog,
    onSaveBookmark,
  } = useQueryBookmarkSave(() => ({
    name: deps.tabTitle()?.trim() || 'Query',
    connectionName: deps.connectionLabel() ?? '',
    sql: deps.sql.value,
  }))

  function openSaveViewModelDialog() {
    const connId = deps.connectionId()
    const instance = deps.databaseName.value
    if (!connId || !instance) {
      workspace.setStatus(t('viewModel.saveFailed'))
      return
    }
    if (!isViewModelSelectSql(deps.sql.value)) {
      workspace.setStatus(t('viewModel.selectOnly'))
      return
    }
    layout.setModule('database')
    void workspace.openViewModelEditor({
      connectionId: connId,
      instanceId: deps.instanceId() ?? deps.tabInstanceId() ?? undefined,
      database: instance,
      sql: deps.sql.value,
    })
  }

  const {
    dialogOpen: indexDraftDialogOpen,
    originalSql: indexDraftQuery,
    suggestedSql: indexDraftSql,
    requestDraft: requestIndexDraft,
    applyDraft: applyIndexDraft,
  } = useIndexDraftSuggest({
    getConnectionId: () => deps.connectionId(),
    getDatabase: () => deps.databaseName.value,
    getDbType: () => deps.dbDialect.value,
    openConsole: (options) => workspace.openConsole(options),
    buildConsoleTitle: () => t('queryResult.indexSuggestConsoleTitle'),
    emptyMessage: () => t('queryResult.indexDraftEmpty'),
  })

  return {
    bookmarkDialogOpen,
    bookmarkSaving,
    bookmarkDefaults,
    openSaveBookmarkDialog,
    onSaveBookmark,
    openSaveViewModelDialog,
    indexDraftDialogOpen,
    indexDraftQuery,
    indexDraftSql,
    requestIndexDraft,
    applyIndexDraft,
  }
}
