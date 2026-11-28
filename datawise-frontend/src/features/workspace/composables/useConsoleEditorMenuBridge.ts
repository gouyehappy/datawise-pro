import {type Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import type {SqlEditorExpose} from '@datawise/sql-editor'
import {useEditorContextMenu} from '@/features/workspace/composables/useEditorContextMenu'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {openSqlTableFromPeek} from '@/features/workspace/services/sql-table-peek.actions'
import {DEFAULT_TABLE_SHORTCUT_ROWS} from '@/features/workspace/services/sql-table-shortcut.service'
import type {SqlRunOptions} from '@/features/workspace/composables/useSqlEditorActions'
import type {DbType} from '@/core/types'
import type {ConnectionCapabilitiesSnapshot} from '@/shared/capabilities/db-type-capabilities'

export type ConsoleEditorMenuBridgeDeps = {
  editorRef: Ref<SqlEditorExpose | undefined>
  aiLayerRef: Ref<any>
  aiSelectionSql: Ref<string>
  connectionId: () => string | undefined
  databaseName: () => string | undefined
  dbDialect: Ref<DbType | string | undefined>
  connectionCaps: Ref<ConnectionCapabilitiesSnapshot>
  capabilityHint: (key: 'sqlExplain') => string
  explainPlanEnabled: Ref<boolean>
  executeSql: (executableOverride?: unknown, runOptions?: SqlRunOptions) => void
  requestExplainPlan: (sql: string) => void
  formatSelection: () => void
  sendSelectionToAi: (sql: string, mode: 'ask' | 'fix') => void
  requestIndexDraft: (payload: {sql: string}) => void
  consoleQuery: Ref<{results: Array<{sql?: string}>; activeView: number}>
}

/** Editor context menu + peek/AI result bridges for SqlConsoleTab. */
export function useConsoleEditorMenuBridge(deps: ConsoleEditorMenuBridgeDeps) {
  const {t} = useI18n()
  const layout = useLayoutStore()

  const {
    visible: editorMenuVisible,
    position: editorMenuPos,
    menuItems: editorMenuItems,
    show: showEditorContextMenu,
    close: closeEditorMenu,
    selectMenuItem: onEditorMenuSelect,
  } = useEditorContextMenu({
    editorRef: () => deps.editorRef.value ?? null,
    runSql: (sqlText) => deps.executeSql(sqlText, {perfSource: 'context-menu'}),
    requestExplainPlan: deps.requestExplainPlan,
    formatSelection: deps.formatSelection,
    openAiInput: (prefill) => {
      if (prefill?.includes('\n')) {
        const lines = prefill.split('\n')
        deps.aiSelectionSql.value = lines.slice(1).join('\n').trim()
      }
      void deps.aiLayerRef.value?.openAiInput(prefill)
    },
    askAiInWorkbench: (sqlText) => deps.sendSelectionToAi(sqlText, 'ask'),
    fixAiInWorkbench: (sqlText) => deps.sendSelectionToAi(sqlText, 'fix'),
    getDbType: () => deps.dbDialect.value as DbType | undefined,
    getCapabilities: () => deps.connectionCaps.value,
    getCapabilityHint: () => deps.capabilityHint('sqlExplain'),
    getExplainPlanEnabled: () => deps.explainPlanEnabled.value,
    getIndexSuggestEnabled: () => true,
    getPreviewRowCount: () => DEFAULT_TABLE_SHORTCUT_ROWS,
    onTableShortcutInvalid: () => {
      layout.showWarningToast(t('console.tableShortcutInvalid'))
    },
    requestIndexSuggest: (targetSql) => {
      deps.requestIndexDraft({sql: targetSql})
    },
  })

  function onEditorContextMenu(payload: {x: number; y: number; selectedText: string}) {
    deps.aiSelectionSql.value = payload.selectedText.trim()
    showEditorContextMenu(payload)
  }

  function onOpenTableFromSql(payload: {tableName: string; tableId?: string; catalog?: string}) {
    void openSqlTableFromPeek(payload, {
      connectionId: deps.connectionId(),
      database: deps.databaseName(),
    })
  }

  function onRequestAiSummary() {
    const view = deps.consoleQuery.value.activeView
    if (view < 0) return
    const result = deps.consoleQuery.value.results[view]
    if (result) deps.aiLayerRef.value?.onRequestAiSummary(result)
  }

  function onRequestAiExplain() {
    const view = deps.consoleQuery.value.activeView
    if (view < 0) return
    const result = deps.consoleQuery.value.results[view]
    if (result) deps.aiLayerRef.value?.onRequestAiExplain(result)
  }

  return {
    editorMenuVisible,
    editorMenuPos,
    editorMenuItems,
    closeEditorMenu,
    onEditorMenuSelect,
    onEditorContextMenu,
    onOpenTableFromSql,
    onRequestAiSummary,
    onRequestAiExplain,
  }
}
