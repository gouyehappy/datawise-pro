<!--
  SQL 控制台 Tab — 业务逻辑在 composables / services，本组件负责布局与事件绑定。
-->
<script setup lang="ts">
import {computed, defineAsyncComponent, onBeforeUnmount, ref, watch} from 'vue'
defineOptions({name: 'SqlConsoleTab'})
import {useI18n} from 'vue-i18n'
import SqlConsoleToolbar from '@/features/workspace/components/SqlConsoleToolbar.vue'
import SqlConsoleDialogs from '@/features/workspace/components/console/SqlConsoleDialogs.vue'
import SqlConsoleEditorSection from '@/features/workspace/components/console/SqlConsoleEditorSection.vue'
import SqlConsoleResultSection from '@/features/workspace/components/console/SqlConsoleResultSection.vue'
import type {SqlEditorExpose} from '@datawise/sql-editor'
import {useExplorerSqlSchemaProvider} from '@/features/workspace/adapters/explorer-sql-schema-provider'
import type {DbType, WorkspaceTab} from '@/core/types'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useEditorFullscreen} from '@/features/workspace/composables/useEditorFullscreen'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import DangerousSqlPendingBar from '@/features/workspace/components/DangerousSqlPendingBar.vue'
import {useConsoleQueryResultActions} from '@/features/workspace/composables/useConsoleQueryResultActions'
import {useConsoleAiAskBridge} from '@/features/workspace/composables/useConsoleAiAskBridge'
import {extractSqlParameters} from '@/features/workspace/services/sql-parameters.service'
import {useConsoleToolbarFeatures} from '@/features/workspace/composables/useConsoleToolbarFeatures'
import {useConsoleVisualQueryBridge} from '@/features/workspace/composables/useConsoleVisualQueryBridge'
import {useConsoleEditorFileDrop} from '@/features/workspace/composables/useConsoleEditorFileDrop'
import {useSqlConsoleTabSync} from '@/features/workspace/composables/useSqlConsoleTabSync'
import {useSqlEditorShortcuts} from '@/features/workspace/composables/useSqlEditorShortcuts'
import {useConsoleSqlCancel} from '@/features/workspace/composables/useConsoleSqlCancel'
import {useTeamStore} from '@/features/team/stores/team-store'
import {canDmlConnection} from '@/features/team/services/connection-access.service'
import {useConsoleRunningElapsed} from '@/features/workspace/composables/useConsoleRunningElapsed'
import {useConsoleSqlRunActions} from '@/features/workspace/composables/useConsoleSqlRunActions'
import {useConsoleEditorMenuBridge} from '@/features/workspace/composables/useConsoleEditorMenuBridge'
import {useSqlConsoleExecution} from '@/features/workspace/composables/useSqlConsoleExecution'
import {useSqlConsoleTabContext} from '@/features/workspace/composables/useSqlConsoleTabContext'
import {useSqlConsoleAuxDialogs} from '@/features/workspace/composables/useSqlConsoleAuxDialogs'
import {
  CONSOLE_EDITOR_HEIGHT_MAX,
  CONSOLE_EDITOR_HEIGHT_MIN,
} from '@/features/workspace/constants/defaults'
import {
  hideSqlSelectionToolbar,
  showSqlSelectionToolbar,
} from '@/features/workspace/services/sql-selection-toolbar.singleton'

const SqlConsoleTeamCollabLayer = defineAsyncComponent(
    () => import('@/features/workspace/components/tabs/SqlConsoleTeamCollabLayer.vue'),
)

const {t} = useI18n()
const {readOnly: guestReadOnly, hint: guestReadOnlyHint} = useResourceWriteGuard(UserResource.WorkspaceScripts)
const props = withDefaults(
    defineProps<{
      tab: WorkspaceTab
      /** PERF-18: false while shelled in background — unmount result grid. */
      paneActive?: boolean
    }>(),
    {paneActive: true},
)

const workspace = useWorkspaceStore()
const appConfig = useAppConfigStore()
const teamStore = useTeamStore()

const sql = ref(props.tab.sql ?? '')
const sqlParamValues = ref<Record<string, string>>({})
const editorReady = ref(false)
let syncingSqlFromStore = false
const parameterNames = computed(() => extractSqlParameters(sql.value))
const aiSelectionSql = ref('')
const splitRef = ref<HTMLElement>()
const editorRef = ref<SqlEditorExpose>()
const aiLayerRef = ref<any>(null)
/** Plain host so child can write parent Refs without template unwrap. */
const editorRefs = {editor: editorRef, aiLayer: aiLayerRef}
const cursorLoading = ref(false)
const toolbarRef = ref<{ refreshTransactionStatus: () => void | Promise<void> } | null>(null)
const schemaProvider = useExplorerSqlSchemaProvider()

let clampEditorHeight = (value: number) =>
  Math.min(CONSOLE_EDITOR_HEIGHT_MAX, Math.max(CONSOLE_EDITOR_HEIGHT_MIN, value))

const editorHeight = computed({
  get: () => appConfig.consoleEditorHeight,
  set: (value: number) => appConfig.setConsoleEditorHeight(clampEditorHeight(value)),
})

/** 本 Tab 内控制；打开工作台默认收起，不跟配置/其它 Tab 粘连 */
const showResultPanel = ref(false)

function getSqlEditor() {
  return editorRef.value
}

function setConsoleSql(value: string) {
  sql.value = value
}

function getConsoleSql() {
  return sql.value
}

function collapseResultPanel() {
  showResultPanel.value = false
}

function expandResultPanel() {
  showResultPanel.value = true
}

const {
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
} = useSqlConsoleTabContext(props.tab)

const {
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
} = useSqlConsoleAuxDialogs({
  tabTitle: () => props.tab.title,
  connectionId: () => connectionId.value || props.tab.connectionId,
  instanceId: () => instanceId.value,
  tabInstanceId: () => props.tab.instanceId,
  databaseName,
  dbDialect: dbDialect as unknown as import('vue').Ref<DbType | undefined>,
  connectionLabel: () => source.value?.label,
  sql,
})

const {isFullscreen: isEditorFullscreen, toggle: toggleEditorFullscreen, exit: exitEditorFullscreen} =
    useEditorFullscreen()

const {
  dangerousSqlPending,
  dangerousSqlPendingSql,
  dangerousSqlPreview,
  dangerousSqlLoading,
  dangerousSqlAffectedCount,
  dangerousSqlSampleRows,
  dangerousSqlSampleColumns,
  dangerousSqlErrorMessage,
  dangerousSqlProductionForced,
  dangerousSqlRisk,
  disarmDangerousSqlPending,
  productionApprovalDialogOpen,
  productionApprovalSubmitting,
  productionApprovalError,
  sqlReviewFindings,
  sqlReviewBlocked,
  sqlReviewSuggestedSql,
  sqlReviewRewriteNote,
  sqlReviewRewriteLoading,
  productionApprovalTeams,
  needsProductionApproval,
  dangerousSqlSubmitTitle,
  approvalContextSql,
  applySqlReviewSuggestion,
  executeSql,
  submitDangerousSql,
  onSubmitProductionApproval,
  onProductionApprovalDialogOpen,
  rollbackDangerousSql,
  saveConsole,
  formatSql,
  formatSelection,
  jumpToErrorLine,
  running,
} = useSqlConsoleExecution({
  tabId: () => props.tab.id,
  tabConnectionId: () => props.tab.connectionId,
  tabInstanceId: () => props.tab.instanceId,
  tabSqlFile: () => props.tab.sqlFile,
  sql,
  sqlParamValues,
  connectionId,
  instanceId,
  databaseName,
  connectionLabel: () => source.value?.label,
  connectionEnvironment,
  dbDialect: dbDialect as unknown as import('vue').Ref<DbType | undefined>,
  productionPerfActive,
  editorRef,
  isEditorFullscreen: () => isEditorFullscreen.value,
  exitEditorFullscreen,
  onExecuteComplete: () => {
    void toolbarRef.value?.refreshTransactionStatus()
  },
})

const {
  sqlFormatEnabled,
  consoleAiEnabled,
  indexSuggestEnabled,
  aiSqlFixEnabled,
  aiResultSummaryEnabled,
  aiExplainEnabled,
  dmlGenerateEnabled,
  canAskAi,
  explainPlanEnabled,
  crossEnvCompareEnabled,
  bookmarksEnabled,
  teamCollabEnabled,
  showToolbarRunGroup,
  showToolbarSaveGroup,
  showToolbarAiGroup,
  mountConsoleAiLayer,
} = useConsoleToolbarFeatures({
  running,
  editorReady,
  getTab: () => props.tab,
})

const {
  visualQueryBuilderOpen,
  openVisualQueryBuilder,
  applyVisualQuerySql,
  applyAndRunVisualQuerySql,
  onVisualQueryTextToSql,
} = useConsoleVisualQueryBridge({
  getConnectionId: () => connectionId.value || props.tab.connectionId,
  getDatabase: () => databaseName.value,
  getSql: () => sql.value,
  setSql: setConsoleSql,
  setStatus: (message) => workspace.setStatus(message),
  needConnectionMessage: () => t('console.visualQuery.needConnection'),
  executeSql: (text, options) => executeSql(text, options),
  openAiInput: (prompt) => { void aiLayerRef.value?.openAiInput(prompt) },
})

const {onEditorDragOver, onEditorDrop} = useConsoleEditorFileDrop({
  insertTextAtCursor: (text) => { editorRef.value?.insertTextAtCursor(text) },
})

const canManageTransactions = computed(() =>
    canDmlConnection(connectionId.value || props.tab.connectionId, teamStore.teams),
)
const canKillSession = computed(() =>
    Boolean((connectionId.value || props.tab.connectionId)?.trim())
    && connectionCaps.value.sessionKill
    && canManageTransactions.value,
)

const {
  confirmOpen: cancelConfirmOpen,
  pendingMode: cancelPendingMode,
  cancelling: cancelInProgress,
  errorMessage: cancelError,
  cancelQueryNow,
  requestCancelConnection,
  closeConfirm: closeCancelConfirm,
  confirmCancel,
} = useConsoleSqlCancel({
  sessionKey: computed(() => props.tab.id),
  running,
  canKill: canKillSession,
})

const {runningElapsedMs, runningElapsedLabel} = useConsoleRunningElapsed(running)

/** PERF-18: keep results in store while hidden; remount grid when pane is active again. */
const mountResultPane = computed(
    () => props.paneActive && !isEditorFullscreen.value && showResultPanel.value,
)

const {
  runWithMode,
  onRunStatementFromGutter,
  runExplainPlanFromToolbar,
  saveStatementAsFileFromToolbar,
  requestExplainPlan,
  runTableShortcutFromSelection,
} = useConsoleSqlRunActions({
  sql,
  editorRef,
  tabId: () => props.tab.id,
  dbDialect: dbDialect as unknown as import('vue').Ref<DbType | undefined>,
  explainPlanEnabled,
  sqlExplainCapable: () => connectionCaps.value.sqlExplain,
  sqlExplainHint: () => capabilityHint('sqlExplain'),
  guestReadOnly,
  guestReadOnlyHint,
  executeSql,
})

const {
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
} = useConsoleQueryResultActions({
  tabId: () => props.tab.id,
  getSql: () => sql.value,
  setSql: (value) => { sql.value = value },
  editorRef,
  cursorLoading,
  running,
  productionPerfActive,
  getConnectionId: () => connectionId.value || props.tab.connectionId,
  getDatabase: () => databaseName.value,
  getConnectionLabel: () => source.value?.label,
  getDbType: () => dbDialect.value,
  executeSql,
})

const {sendSelectionToAi, onRequestAiAsk} = useConsoleAiAskBridge({
  getConnectionId: () => connectionId.value || props.tab.connectionId,
  getDatabase: () => databaseName.value,
  getConnectionLabel: () => source.value?.label,
  getDialect: () => (typeof dbDialect.value === 'string' ? dbDialect.value : undefined),
  getActiveResultSql: () => {
    const view = consoleQuery.value.activeView
    if (view < 0) return undefined
    return consoleQuery.value.results[view]?.sql
  },
})

const {
  editorMenuVisible,
  editorMenuPos,
  editorMenuItems,
  closeEditorMenu,
  onEditorMenuSelect,
  onEditorContextMenu,
  onOpenTableFromSql,
  onRequestAiSummary,
  onRequestAiExplain,
} = useConsoleEditorMenuBridge({
  editorRef,
  aiLayerRef,
  aiSelectionSql,
  connectionId: () => connectionId.value || props.tab.connectionId,
  databaseName: () => databaseName.value,
  dbDialect,
  connectionCaps,
  capabilityHint,
  explainPlanEnabled,
  executeSql,
  requestExplainPlan,
  formatSelection,
  sendSelectionToAi,
  requestIndexDraft,
  consoleQuery,
})

/**
 * 选中浮层：只向模块级单例注册状态与动作闭包，不写本组件的任何响应式字段。
 * 这样选中态变化只触发 AppShell 里的浮层渲染，绝不在 Tab 的 patch 窗口中改父级状态。
 */
function onEditorSelectionChange(payload: {selectedText: string; x: number; y: number} | null) {
  // visibility 常驻壳下所有 Tab 都挂载着编辑器；只有当前激活 Tab 才允许抢占浮层。
  if (workspace.activeTabId !== props.tab.id) return
  if (!payload || !payload.selectedText.trim()) {
    hideSqlSelectionToolbar(props.tab.id)
    return
  }
  const selectedText = payload.selectedText
  showSqlSelectionToolbar(
      props.tab.id,
      {
        selectedText,
        x: payload.x,
        y: payload.y,
        // EXPLAIN 可用性与右键菜单保持同一判定
        explainSupported: explainPlanEnabled.value && (connectionCaps.value.sqlExplain ?? true),
      },
      {
        run: () => executeSql(selectedText, {perfSource: 'context-menu'}),
        explain: () => requestExplainPlan(selectedText),
        format: () => formatSelection(),
      },
  )
}

/** 右键打开菜单时收起选中浮层，两者不同时出现。 */
function handleEditorContextMenu(payload: {x: number; y: number; selectedText: string}) {
  hideSqlSelectionToolbar(props.tab.id)
  onEditorContextMenu(payload)
}

// Tab 失活 / 关闭时清理浮层所有者，避免其它 Tab 误触发已销毁 Tab 的动作闭包。
watch(
    () => workspace.activeTabId,
    (activeTabId) => {
      if (activeTabId !== props.tab.id) hideSqlSelectionToolbar(props.tab.id)
    },
)
onBeforeUnmount(() => hideSqlSelectionToolbar(props.tab.id))

/** 有结果可回看时才显示底部收起条；从未查询过则编辑器占满 */
const canReopenResultPanel = computed(
    () => consoleQuery.value.results.length > 0 || running.value,
)

const {clampEditorHeight: clampEditorHeightFromSync} = useSqlConsoleTabSync({
  getTab: () => props.tab,
  sql,
  editorRef,
  splitRef,
  editorReady,
  editorHeight,
  isEditorFullscreen,
  running,
  resultCount: () => consoleQuery.value.results.length,
  dangerousSqlPending,
  disarmDangerousSqlPending,
  expandResultPanel,
  collapseResultPanel,
  executeSql,
  openAiInput: () => { void aiLayerRef.value?.openAiInput() },
  hasAiInput: () => typeof aiLayerRef.value?.openAiInput === 'function',
  connectionId,
  instanceId,
  activeInstanceLabel: () => activeInstance.value?.label,
  markSyncingFromStore: (syncing) => { syncingSqlFromStore = syncing },
  isSyncingFromStore: () => syncingSqlFromStore,
})
clampEditorHeight = clampEditorHeightFromSync

useSqlEditorShortcuts(props.tab.id, () => ({
  'workspace.runSql': () => executeSql(undefined, {perfSource: 'shortcut'}),
  'workspace.selectFirstRows': () => runTableShortcutFromSelection('select-first'),
  'workspace.countRows': () => runTableShortcutFromSelection('count'),
  'workspace.saveConsole': saveConsole,
  'workspace.aiPrompt': showToolbarAiGroup.value
      ? () => void aiLayerRef.value?.openAiInput()
      : undefined,
}))

</script>

<template>
  <div class="console-tab dw-workbench-page" data-wb-recipe="wb-editor-results" :class="{ 'is-editor-fullscreen': isEditorFullscreen }">
    <SqlConsoleToolbar
        ref="toolbarRef"
        :running="running"
        :running-elapsed-label="runningElapsedLabel"
        :dangerous-sql-pending="dangerousSqlPending"
        :dangerous-sql-submit-title="dangerousSqlSubmitTitle"
        :explain-plan-enabled="explainPlanEnabled"
        :sql-explain-capable="connectionCaps.sqlExplain"
        :sql-explain-hint="capabilityHint('sqlExplain')"
        :visual-query-builder-capable="connectionCaps.visualQueryBuilder"
        :jdbc-tunnel-ssh-enabled="jdbcTunnelSshEnabled"
        :connection-id="connectionId"
        :tab-connection-id="tab.connectionId"
        :tab-id="tab.id"
        :tab-database="tab.database"
        :connection-write-guard="connectionWriteGuard"
        :show-toolbar-run-group="showToolbarRunGroup"
        :show-toolbar-save-group="showToolbarSaveGroup"
        :show-toolbar-ai-group="showToolbarAiGroup"
        :guest-read-only="guestReadOnly"
        :guest-read-only-hint="guestReadOnlyHint"
        :bookmarks-enabled="bookmarksEnabled"
        :sql-format-enabled="sqlFormatEnabled"
        :is-editor-fullscreen="isEditorFullscreen"
        :ai-input-active="Boolean(aiLayerRef?.showAiInput)"
        :database-name="databaseName"
        :can-manage-transactions="canManageTransactions"
        :data-sources="dataSources"
        :workspace-bound="workspaceBound"
        :bound-connection-label="source?.label"
        :db-dialect="dbDialect"
        :instance-id="instanceId"
        @run="executeSql(undefined, {perfSource: 'toolbar'})"
        @cancel="cancelQueryNow()"
        @run-with-mode="runWithMode"
        @explain="runExplainPlanFromToolbar"
        @submit-dangerous="submitDangerousSql"
        @rollback-dangerous="rollbackDangerousSql"
        @cancel-connection="requestCancelConnection()"
        @open-jdbc-ssh="openJdbcTunnelSshTerminal"
        @save="saveConsole"
        @save-as="saveStatementAsFileFromToolbar"
        @bookmark="openSaveBookmarkDialog"
        @view-model="openSaveViewModelDialog"
        @format="formatSql"
        @fold-all="editorRef?.foldAll()"
        @unfold-all="editorRef?.unfoldAll()"
        @open-settings="editorRef?.openSettings?.()"
        @visual-query="openVisualQueryBuilder"
        @toggle-fullscreen="toggleEditorFullscreen"
        @toggle-ai="aiLayerRef?.toggleAiInput()"
        @update:connection-id="connectionId = $event"
        @update:instance-id="instanceId = $event"
    />

    <DangerousSqlPendingBar
        v-if="dangerousSqlPending"
        :sql="dangerousSqlPendingSql"
        :preview="dangerousSqlPreview"
        :loading="dangerousSqlLoading"
        :affected-count="dangerousSqlAffectedCount"
        :sample-rows="dangerousSqlSampleRows"
        :sample-columns="dangerousSqlSampleColumns"
        :error-message="dangerousSqlErrorMessage"
        :production-forced="dangerousSqlProductionForced"
        :risk="dangerousSqlRisk"
        :production-approval-required="needsProductionApproval"
        :sql-review-findings="sqlReviewFindings"
        :sql-review-blocked="sqlReviewBlocked"
        :sql-review-suggested-sql="sqlReviewSuggestedSql"
        :sql-review-rewrite-note="sqlReviewRewriteNote"
        :sql-review-rewrite-loading="sqlReviewRewriteLoading"
        @apply-suggested-sql="applySqlReviewSuggestion"
    />
    <SqlConsoleTeamCollabLayer
        v-if="teamCollabEnabled"
        v-model:sql="sql"
        :tab="tab"
        :connection-id="connectionId || tab.connectionId || ''"
        :database-name="databaseName ?? ''"
        :source-label="source?.label ?? ''"
    />

    <div ref="splitRef" class="split dw-seam-stack">
      <div
          class="editor-pane"
          :class="{
          'editor-pane--fullscreen': isEditorFullscreen,
          'editor-pane--expanded': !isEditorFullscreen && !showResultPanel,
        }"
          :style="!isEditorFullscreen && showResultPanel ? { height: `${editorHeight}px` } : undefined"
      >
        <SqlConsoleEditorSection
            :tab="tab"
            :sql="sql"
            @update:sql="sql = $event"
            :editor-ready="editorReady"
            :editor-refs="editorRefs"
            :parameter-names="parameterNames"
            :sql-param-values="sqlParamValues"
            @update:sql-param-values="sqlParamValues = $event"
            :ai-selection-sql="aiSelectionSql"
            @update:ai-selection-sql="aiSelectionSql = $event"
            :connection-id="connectionId || tab.connectionId || ''"
            :database-name="databaseName"
            :db-dialect="dbDialect"
            :source-label="source?.label ?? ''"
            :active-instance-label="activeInstance?.label ?? null"
            :schema-provider="schemaProvider"
            :mount-console-ai-layer="mountConsoleAiLayer"
            :console-ai-enabled="consoleAiEnabled"
            :ai-sql-fix-enabled="aiSqlFixEnabled"
            :index-suggest-enabled="indexSuggestEnabled"
            :ai-result-summary-enabled="aiResultSummaryEnabled"
            :ai-explain-enabled="aiExplainEnabled"
            :get-sql="getConsoleSql"
            :set-sql="setConsoleSql"
            :get-editor="getSqlEditor"
            :on-editor-drag-over="onEditorDragOver"
            :on-editor-drop="onEditorDrop"
            @contextmenu="handleEditorContextMenu"
            @selection-change="onEditorSelectionChange"
            @run-statement="onRunStatementFromGutter"
            @open-table="onOpenTableFromSql"
        />
      </div>
      <SqlConsoleResultSection
          :show-result-panel="showResultPanel"
          :is-editor-fullscreen="isEditorFullscreen"
          :mount-result-pane="mountResultPane"
          :can-reopen-result-panel="canReopenResultPanel"
          :editor-height="editorHeight"
          @update:editor-height="editorHeight = $event"
          :results="consoleQuery.results"
          :active-view="consoleQuery.activeView"
          :running="running"
          :running-elapsed-ms="runningElapsedMs"
          :dml-generate-enabled="dmlGenerateEnabled"
          :dml-connection-id="connectionId || tab.connectionId"
          :dml-connection-name="source?.label"
          :dml-database="databaseName"
          :ai-sql-fix-enabled="aiSqlFixEnabled"
          :ai-fix-loading="aiLayerRef?.aiFixLoading ?? false"
          :ai-result-summary-enabled="aiResultSummaryEnabled"
          :can-ask-ai="canAskAi"
          :ai-summary-loading="aiLayerRef?.aiSummaryLoading ?? false"
          :ai-summary-open="aiLayerRef?.aiSummaryOpen ?? false"
          :ai-summary-text="aiLayerRef?.aiSummaryText ?? ''"
          :index-suggest-enabled="indexSuggestEnabled"
          :ai-index-suggest-loading="aiLayerRef?.aiIndexSuggestLoading ?? false"
          :ai-explain-enabled="aiExplainEnabled"
          :ai-explain-loading="aiLayerRef?.aiExplainLoading ?? false"
          :ai-explain-open="aiLayerRef?.aiExplainOpen ?? false"
          :ai-explain-text="aiLayerRef?.aiExplainText ?? ''"
          :cross-env-compare-enabled="crossEnvCompareEnabled && Boolean((connectionId || tab.connectionId) && databaseName)"
          :db-type="dbDialect"
          :export-suggest-mask="connectionEnvironment === 'prod'"
          :production-perf-active="productionPerfActive"
          :cursor-loading="cursorLoading"
          @expand="expandResultPanel"
          @collapse="collapseResultPanel"
          @update:active-view="onActiveViewChange"
          @close-result="onCloseResult"
          @close-other-results="onCloseOtherResults"
          @close-all-results="onCloseAllResults"
          @jump-to-error-line="jumpToErrorLine"
          @request-ai-fix="(payload) => aiLayerRef?.requestAiSqlFix(payload)"
          @request-ai-summary="onRequestAiSummary"
          @request-ai-ask="onRequestAiAsk"
          @close-ai-summary="aiLayerRef?.closeAiSummary()"
          @request-ai-explain="onRequestAiExplain"
          @close-ai-explain="aiLayerRef?.closeAiExplain()"
          @request-index-suggest="(payload) => requestIndexDraft(payload)"
          @request-ai-index-suggest="(payload) => aiLayerRef?.requestAiIndexSuggest(payload)"
          @open-cross-env-compare="openCrossEnvCompareFromResult"
          @refresh="refreshActiveResult"
          @load-more="onLoadMoreResult"
          @raise-max-rows="onRaiseMaxRows"
          @insert-order-by="onInsertOrderByFromResult"
          @insert-where="onInsertWhereFromResult"
          @insert-where-in="onInsertWhereInFromResult"
          @rewrite-where="onRewriteWhereFromResult"
          @rewrite-order-by="onRewriteOrderByFromResult"
      />
    </div>

    <SqlConsoleDialogs
        :editor-menu-visible="editorMenuVisible"
        :editor-menu-items="editorMenuItems"
        :editor-menu-x="editorMenuPos.x"
        :editor-menu-y="editorMenuPos.y"
        :index-draft-dialog-open="indexDraftDialogOpen"
        :index-draft-query="indexDraftQuery"
        :index-draft-sql="indexDraftSql"
        :bookmarks-enabled="bookmarksEnabled"
        :bookmark-dialog-open="bookmarkDialogOpen"
        :bookmark-defaults="bookmarkDefaults"
        :bookmark-saving="bookmarkSaving"
        :production-approval-dialog-open="productionApprovalDialogOpen"
        :production-approval-submitting="productionApprovalSubmitting"
        :production-approval-error="productionApprovalError"
        :approval-context-sql="approvalContextSql"
        :connection-label="source?.label ?? ''"
        :database-name="databaseName"
        :production-approval-teams="productionApprovalTeams"
        :visual-query-builder-open="visualQueryBuilderOpen"
        :connection-id="connectionId || tab.connectionId"
        :cancel-confirm-open="cancelConfirmOpen"
        :cancel-pending-mode="cancelPendingMode"
        :cancel-in-progress="cancelInProgress"
        :cancel-error="cancelError"
        @editor-menu-select="onEditorMenuSelect"
        @editor-menu-close="closeEditorMenu"
        @update:index-draft-dialog-open="indexDraftDialogOpen = $event"
        @apply-index-draft="applyIndexDraft"
        @update:bookmark-dialog-open="bookmarkDialogOpen = $event"
        @save-bookmark="onSaveBookmark"
        @update:production-approval-open="onProductionApprovalDialogOpen"
        @submit-production-approval="onSubmitProductionApproval"
        @update:visual-query-builder-open="visualQueryBuilderOpen = $event"
        @apply-visual-query="applyVisualQuerySql"
        @apply-and-run-visual-query="applyAndRunVisualQuerySql"
        @visual-query-text-to-sql="onVisualQueryTextToSql"
        @confirm-cancel="confirmCancel()"
        @close-cancel="closeCancelConfirm()"
    />
  </div>
</template>

<style scoped src="../../styles/sql-console-tab.css"></style>
