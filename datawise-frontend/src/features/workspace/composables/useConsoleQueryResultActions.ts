import {computed, ref, type Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {sqlApi} from '@/api'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {SqlEditorExpose} from '@datawise/sql-editor'
import type {QueryResultRefreshRequest} from '@/features/workspace/services/query-result-refresh.service'
import type {SqlRunOptions} from '@/features/workspace/composables/useSqlEditorActions'
import {mergeCursorPageIntoQueryResult} from '@/features/workspace/services/query-result-cursor.service'
import {
  resolveCursorLoadedRowsMax,
  resolveClientMaxResultRows,
  resolveSqlPageSize,
} from '@/features/settings/services/query-limit.service'
import {
  buildOrderByFillInsert,
  buildWhereFillInsert,
  buildWhereInFillInsert,
} from '@/features/workspace/services/result-sql-fill.service'
import {
  applyOrderByToSql,
  applyWhereConditionToSql,
  nextOrderDirection,
} from '@/features/workspace/services/result-sql-rewrite.service'
import {buildWhereEqualsClause} from '@/features/workspace/services/grid-cell-context.service'
import {
  validateCrossEnvCompareSql,
  buildCrossEnvCompareScope,
} from '@/features/cross-env-compare/services/cross-env-compare.service'
import type {DbType} from '@/core/types'

export type ConsoleQueryResultActionsDeps = {
  tabId: () => string
  getSql: () => string
  setSql: (sql: string) => void
  editorRef: Ref<SqlEditorExpose | undefined>
  cursorLoading: Ref<boolean>
  running: Ref<boolean>
  productionPerfActive: Ref<boolean>
  getConnectionId: () => string | undefined
  getDatabase: () => string | undefined
  getConnectionLabel: () => string | undefined
  getDbType: () => DbType | string | undefined
  executeSql: (executableOverride?: unknown, runOptions?: SqlRunOptions) => void
}

/** Result pane close / refresh / order / where / load-more / cross-env helpers. */
export function useConsoleQueryResultActions(deps: ConsoleQueryResultActionsDeps) {
  const {t} = useI18n()
  const layout = useLayoutStore()
  const workspace = useWorkspaceStore()
  const explorer = useExplorerStore()

  const consoleQuery = computed(() => {
    const state = workspace.consoleQueryByTabId[deps.tabId()]
    return state ?? {results: [], activeView: -1}
  })

  const lastOrderFill = ref<{column: string; direction: 'asc' | 'desc'} | null>(null)

  function openCrossEnvCompareFromResult(index: number) {
    const result = consoleQuery.value.results[index]
    const connId = deps.getConnectionId()
    const database = deps.getDatabase()
    if (!connId || !database || !result?.sql?.trim()) return

    const sqlError = validateCrossEnvCompareSql(result.sql)
    if (sqlError) {
      workspace.setStatus(t(`crossEnvCompare.errors.${sqlError}`))
      return
    }

    const scope = buildCrossEnvCompareScope({
      connectionId: connId,
      connectionLabel: deps.getConnectionLabel() ?? explorer.findNode(connId)?.label ?? connId,
      database,
      dbType: (deps.getDbType() as DbType) ?? 'mysql',
    })
    workspace.openCrossEnvCompare({left: scope, sql: result.sql})
  }

  function onActiveViewChange(view: number) {
    workspace.setConsoleActiveView(deps.tabId(), view)
  }

  function onCloseResult(index: number) {
    workspace.closeConsoleQueryResult(deps.tabId(), index)
  }

  function onCloseOtherResults(index: number) {
    workspace.closeOtherConsoleQueryResults(deps.tabId(), index)
  }

  function onCloseAllResults() {
    workspace.closeAllConsoleQueryResults(deps.tabId())
  }

  function refreshActiveResult(payload?: QueryResultRefreshRequest) {
    if (!payload) return
    deps.executeSql(payload.sql, {refreshResultIndex: payload.resultIndex, skipDangerousCheck: true})
  }

  function onRaiseMaxRows(maxRows: number) {
    const view = consoleQuery.value.activeView
    if (view < 0) return
    const result = consoleQuery.value.results[view]
    if (!result?.sql?.trim()) return
    deps.executeSql(result.sql, {
      refreshResultIndex: view,
      skipDangerousCheck: true,
      maxRowsOverride: maxRows,
    })
  }

  function onInsertOrderByFromResult(payload: {column: string; direction: 'asc' | 'desc'}) {
    const editor = deps.editorRef.value
    if (!editor) return
    const direction = payload.direction === 'desc'
        ? 'desc'
        : nextOrderDirection(lastOrderFill.value, payload.column)
    lastOrderFill.value = {column: payload.column, direction}
    editor.insertTextAtCursor(buildOrderByFillInsert(payload.column, direction))
  }

  function onInsertWhereFromResult(payload: {column: string; value: unknown}) {
    const editor = deps.editorRef.value
    if (!editor) return
    const statement = editor.getCurrentLineSql?.()?.trim() || deps.getSql()
    editor.insertTextAtCursor(buildWhereFillInsert(statement, payload.column, payload.value))
  }

  function onInsertWhereInFromResult(payload: {column: string; clause: string}) {
    const editor = deps.editorRef.value
    if (!editor) return
    const statement = editor.getCurrentLineSql?.()?.trim() || deps.getSql()
    const text = buildWhereInFillInsert(statement, payload.clause)
    if (!text) return
    editor.insertTextAtCursor(text)
  }

  function resolveActiveResultSql(): string {
    const view = consoleQuery.value.activeView
    if (view < 0) return deps.getSql()
    const result = consoleQuery.value.results[view]
    return result?.sql?.trim() || deps.getSql()
  }

  function replaceEditorSql(nextSql: string) {
    deps.setSql(nextSql)
    deps.editorRef.value?.layout()
  }

  function onRewriteWhereFromResult(payload: {column: string; value: unknown}) {
    const source = resolveActiveResultSql()
    if (!source) return
    const condition = buildWhereEqualsClause(payload.column, payload.value)
    replaceEditorSql(applyWhereConditionToSql(source, condition))
  }

  function onRewriteOrderByFromResult(payload: {column: string; direction: 'asc' | 'desc'}) {
    const source = resolveActiveResultSql()
    if (!source) return
    const direction = payload.direction === 'desc'
        ? 'desc'
        : nextOrderDirection(lastOrderFill.value, payload.column)
    lastOrderFill.value = {column: payload.column, direction}
    replaceEditorSql(applyOrderByToSql(source, payload.column, direction))
  }

  async function onLoadMoreResult(index: number) {
    const result = consoleQuery.value.results[index]
    if (!result?.cursorId || deps.cursorLoading.value || deps.running.value) return
    const tabId = deps.tabId()
    const runGeneration = workspace.beginConsoleRun(tabId)
    deps.cursorLoading.value = true
    try {
      const page = await sqlApi.fetchCursorPage(
          result.cursorId,
          result.pageSize ?? resolveSqlPageSize(deps.productionPerfActive.value),
      )
      if (!workspace.isConsoleRunCurrent(tabId, runGeneration)) return
      const clientMax = resolveClientMaxResultRows(deps.productionPerfActive.value)
      workspace.appendConsoleQueryResultPage(
          tabId,
          index,
          mergeCursorPageIntoQueryResult(result, page, {
            maxRows: resolveCursorLoadedRowsMax(deps.productionPerfActive.value),
            hardCap: clientMax > 0,
          }),
      )
    } catch (error) {
      if (!workspace.isConsoleRunCurrent(tabId, runGeneration)) return
      layout.showErrorToast(
          resolveCaughtApiErrorMessage(error, t, 'console.loadMoreFailed'),
      )
    } finally {
      workspace.endConsoleRun(tabId, runGeneration)
      deps.cursorLoading.value = false
    }
  }

  return {
    consoleQuery,
    openCrossEnvCompareFromResult,
    onActiveViewChange,
    onCloseResult,
    onCloseOtherResults,
    onCloseAllResults,
    refreshActiveResult,
    onRaiseMaxRows,
    onInsertOrderByFromResult,
    onInsertWhereFromResult,
    onInsertWhereInFromResult,
    onRewriteWhereFromResult,
    onRewriteOrderByFromResult,
    onLoadMoreResult,
  }
}
