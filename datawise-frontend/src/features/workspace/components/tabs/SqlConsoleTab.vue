<!--
  SQL 控制台 Tab — 业务逻辑在 composables / services，本组件负责布局与事件绑定。
-->
<script setup lang="ts">
import {computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'

defineOptions({name: 'SqlConsoleTab'})
import {storeToRefs} from 'pinia'
import {useI18n} from 'vue-i18n'
import {ConsoleCtxBar, ConsoleTransactionBar, QueryResultPane} from '@/features/workspace/components'
import ConsoleRunSplitButton from '@/features/workspace/components/ConsoleRunSplitButton.vue'
import {ContextMenuHost} from '@/core/context-menu'
import EditorFullscreenButton from '@/core/components/EditorFullscreenButton.vue'
import IconButton from '@/core/components/IconButton.vue'
import ConsoleToolbarIcon from '@/core/components/ConsoleToolbarIcon.vue'
import {SqlEditor} from '@datawise/sql-editor'
import type {SqlEditorExpose} from '@datawise/sql-editor'
import {getActiveSqlEditorRuntime} from '@datawise/sql-editor/runtime/sql-editor-runtime'
import {useExplorerSqlSchemaProvider} from '@/features/workspace/adapters/explorer-sql-schema-provider'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {buildRecentQueriesFromSqlLogs} from '@/features/workspace/services/recent-sql-suggest.service'
import ResizeHandle from '@/core/components/ResizeHandle.vue'
import {shortcutTooltip} from '@/features/layout/composables/useAppShortcutListener'
import {useSqlEditorShortcuts} from '@/features/workspace/composables/useSqlEditorShortcuts'
import {useEditorContextMenu} from '@/features/workspace/composables/useEditorContextMenu'
import {openSqlTableFromPeek} from '@/features/workspace/services/sql-table-peek.actions'
import type {WorkspaceTab} from '@/core/types'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useConsoleConnectionContext} from '@/features/workspace/composables/useConsoleConnectionContext'
import {
  DEFAULT_TABLE_SHORTCUT_ROWS,
  buildTableShortcutSql,
} from '@/features/workspace/services/sql-table-shortcut.service'
import {useConnectionCapabilities} from '@/features/datasource/composables/useConnectionCapabilities'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {useEditorFullscreen} from '@/features/workspace/composables/useEditorFullscreen'
import {useSqlEditorActions, type SqlRunOptions} from '@/features/workspace/composables/useSqlEditorActions'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import {useFeaturePermission} from '@/features/auth/composables/useFeaturePermission'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {UserResource} from '@/features/auth/types/user-resource.types'
import type {QueryResultRefreshRequest} from '@/features/workspace/services/query-result-refresh.service'
import {resolveConsoleInstanceLabel, buildExplorerScopedLabelResolver} from '@/features/workspace/services/resolve-console-instance'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {sqlApi} from '@/api'
import {mergeCursorPageIntoQueryResult} from '@/features/workspace/services/query-result-cursor.service'
import {DANGEROUS_SQL_PREVIEW_ROWS} from '@/features/workspace/constants/query-result-limits'
import {
  resolveCursorLoadedRowsMax,
  resolveClientMaxResultRows,
  resolveSqlPageSize,
} from '@/features/settings/services/query-limit.service'
import {useProductionPerfMode} from '@/features/settings/composables/useProductionPerfMode'
import {ensureSqlEditorPlugin} from '@/features/workspace/services/ensure-sql-editor-plugin'
import {useQueryBookmarkSave} from '@/features/workspace/composables/useQueryBookmarkSave'
import {isViewModelSelectSql} from '@/api/modules/view-model'
import DangerousSqlPendingBar from '@/features/workspace/components/DangerousSqlPendingBar.vue'
import ConsoleSqlCancelDialog from '@/features/workspace/components/ConsoleSqlCancelDialog.vue'
import SqlParameterPanel from '@/features/workspace/components/SqlParameterPanel.vue'
import SqlExecutionLimitHint from '@/features/workspace/components/SqlExecutionLimitHint.vue'
import DwPanelState from '@/core/components/DwPanelState.vue'
import {useIndexDraftSuggest} from '@/features/workspace/composables/useIndexDraftSuggest'
import {useDangerousSqlPending} from '@/features/workspace/composables/useDangerousSqlPending'
import {normalizeConnectionEnvironment} from '@/features/connection/services/connection-environment.service'
import {shouldConfirmDangerousSql} from '@/features/workspace/services/dangerous-sql-confirm-policy.service'
import {splitSqlStatements} from '@/features/workspace/services/split-sql-statements'
import {resolveExecutableSql} from '@/features/workspace/services/resolve-executable-sql'
import type {SqlExecuteMode} from '@/features/workspace/services/resolve-executable-sql'
import {formatDurationMs} from '@/features/workspace/services/sql-stats.service'
import {useConsoleSqlCancel} from '@/features/workspace/composables/useConsoleSqlCancel'
import {useTeamStore} from '@/features/team/stores/team-store'
import {resolveProductionApprovalTeams} from '@/features/team/services/production-approval-policy.service'
import {canDmlConnection} from '@/features/team/services/connection-access.service'
import {applySqlParameters, extractSqlParameters} from '@/features/workspace/services/sql-parameters.service'
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
    supportsExplainAnalyze,
    wrapExplainSql,
} from '@/features/workspace/services/explain-plan.service'
import {validateCrossEnvCompareSql, buildCrossEnvCompareScope} from '@/features/cross-env-compare/services/cross-env-compare.service'
import {reviewSql} from '@/features/platform/services/sql-review.service'
import type {SqlReviewFinding} from '@/features/platform/types/platform.types'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import {isJdbcSshTunnelEnabled} from '@/features/ssh/services/ssh-jdbc-tunnel.service'
import {
  LOCAL_FILE_ABS_PATH_MIME,
  LOCAL_FILE_PATH_MIME,
  dataTransferHasType,
  readLocalAbsPathFromDataTransfer,
  readLocalFilePathFromDataTransfer,
} from '@/features/local-files/services/local-files-dnd'
import {openLocalWorkspaceFile} from '@/features/local-files/services/open-local-file.service'

import {
  CONSOLE_EDITOR_HEIGHT_DEFAULT,
  CONSOLE_EDITOR_HEIGHT_MAX,
  CONSOLE_EDITOR_HEIGHT_MIN,
  CONSOLE_EDITOR_HEIGHT_RATIO,
  CONSOLE_RESULT_MIN_HEIGHT
} from '@/features/workspace/constants/defaults'

const SqlConsoleAiLayer = defineAsyncComponent((() =>
    import.meta.env.VITE_DATAWISE_EDITION === 'standard'
        ? import('@/features/pack/stubs/AiConsoleLayerStub.vue')
        : import('@/features/workspace/components/tabs/SqlConsoleAiLayer.vue')
) as any)
const IndexSuggestDialog = defineAsyncComponent(
    () => import('@/features/workspace/components/IndexSuggestDialog.vue'),
)
const SqlConsoleTeamCollabLayer = defineAsyncComponent(
    () => import('@/features/workspace/components/tabs/SqlConsoleTeamCollabLayer.vue'),
)
const SaveBookmarkDialog = defineAsyncComponent(
    () => import('@/features/workspace/components/SaveBookmarkDialog.vue'),
)
const SubmitProductionApprovalDialog = defineAsyncComponent(
    () => import('@/features/workspace/components/SubmitProductionApprovalDialog.vue'),
)
const VisualQueryBuilderDialog = defineAsyncComponent(
    () => import('@/features/workspace/components/VisualQueryBuilderDialog.vue'),
)

const {t} = useI18n()
const {readOnly: guestReadOnly, hint: guestReadOnlyHint} = useResourceWriteGuard(UserResource.WorkspaceScripts)
const {can} = useFeaturePermission()
const props = defineProps<{ tab: WorkspaceTab }>()

const workspace = useWorkspaceStore()
const explorer = useExplorerStore()
const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const pluginStore = usePluginStore()
const shortcutPanel = useShortcutPanelStore()
const {consoleQueryByTabId} = storeToRefs(workspace)

const sql = ref(props.tab.sql ?? '')
const sqlParamValues = ref<Record<string, string>>({})
const editorReady = ref(false)
let syncingSqlFromStore = false
const parameterNames = computed(() => extractSqlParameters(sql.value))
const aiSelectionSql = ref('')
const splitRef = ref<HTMLElement>()
const editorRef = ref<SqlEditorExpose>()
const cursorLoading = ref(false)
const transactionBarRef = ref<{ refreshStatus: () => Promise<void> } | null>(null)
const schemaProvider = useExplorerSqlSchemaProvider()

const editorHeight = computed({
  get: () => appConfig.consoleEditorHeight,
  set: (value: number) => appConfig.setConsoleEditorHeight(clampEditorHeight(value)),
})

/** 本 Tab 内控制；打开工作台默认收起，不跟配置/其它 Tab 粘连 */
const showResultPanel = ref(false)

const sqlFormatEnabled = computed(() => pluginStore.isEnabled('p-sql-format'))
const consoleAiEnabled = computed(
    () => import.meta.env.VITE_DATAWISE_EDITION !== 'standard' && pluginStore.isEnabled('p-console-ai'),
)
const indexSuggestEnabled = computed(
    () => import.meta.env.VITE_DATAWISE_EDITION !== 'standard' && pluginStore.isEnabled('p-ai-index-suggest'),
)
const aiSqlFixEnabled = computed(
    () => import.meta.env.VITE_DATAWISE_EDITION !== 'standard' && pluginStore.isEnabled('p-ai-sql-fix'),
)
const aiResultSummaryEnabled = computed(
    () =>
        import.meta.env.VITE_DATAWISE_EDITION !== 'standard'
        && pluginStore.isEnabled('p-ai-result-summary')
        && can(FeaturePermission.WorkbenchResultAiSummary),
)
const aiExplainEnabled = computed(
    () => import.meta.env.VITE_DATAWISE_EDITION !== 'standard' && pluginStore.isEnabled('p-ai-explain'),
)
const dmlGenerateEnabled = computed(() => pluginStore.isSwitchEnabled('p-dml-generate'))
const explainPlanEnabled = computed(() => pluginStore.isEnabled('p-explain-plan'))
const crossEnvCompareEnabled = computed(() => pluginStore.isEnabled('p-cross-env-compare'))
const bookmarksEnabled = computed(() => pluginStore.isEnabled('p-sql-bookmarks'))
const anyAiFeatureEnabled = computed(() =>
    consoleAiEnabled.value
    || aiSqlFixEnabled.value
    || indexSuggestEnabled.value
    || aiResultSummaryEnabled.value
    || aiExplainEnabled.value,
)
const teamCollabEnabled = computed(() => Boolean(props.tab.teamSharedQuery?.teamId && props.tab.teamSharedQuery?.queryId))
const aiLayerRef = ref<any>(null)

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

const {connectionId, instanceId, dataSources, source, activeInstance, workspaceBound} =
    useConsoleConnectionContext(props.tab)

const jdbcTunnelSshEnabled = ref(false)

watch(
    () => connectionId.value || props.tab.connectionId,
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
    const connId = connectionId.value || props.tab.connectionId
    if (!connId) return
    workspace.openSshTerminal({
        connectionId: connId,
        connectionName: source.value?.label ?? explorer.findNode(connId)?.label ?? connId,
        explorerNodeId: connId,
    })
}

const {
  bookmarkDialogOpen,
  bookmarkSaving,
  bookmarkDefaults,
  openSaveBookmarkDialog,
  onSaveBookmark,
} = useQueryBookmarkSave(() => ({
  name: props.tab.title?.trim() || 'Query',
  connectionName: source.value?.label ?? '',
  sql: sql.value,
}))

function openSaveViewModelDialog() {
  const connId = connectionId.value || props.tab.connectionId
  const instance = databaseName.value
  if (!connId || !instance) {
    workspace.setStatus(t('viewModel.saveFailed'))
    return
  }
  if (!isViewModelSelectSql(sql.value)) {
    workspace.setStatus(t('viewModel.selectOnly'))
    return
  }
  layout.setModule('database')
  void workspace.openViewModelEditor({
    connectionId: connId,
    instanceId: instanceId.value ?? props.tab.instanceId ?? undefined,
    database: instance,
    sql: sql.value,
  })
}

const visualQueryBuilderOpen = ref(false)

const {
  dialogOpen: indexDraftDialogOpen,
  originalSql: indexDraftQuery,
  suggestedSql: indexDraftSql,
  requestDraft: requestIndexDraft,
  applyDraft: applyIndexDraft,
} = useIndexDraftSuggest({
  getConnectionId: () => connectionId.value || props.tab.connectionId,
  getDatabase: () => databaseName.value,
  getDbType: () => dbDialect.value,
  openConsole: (options) => workspace.openConsole(options),
  buildConsoleTitle: () => t('queryResult.indexSuggestConsoleTitle'),
  emptyMessage: () => t('queryResult.indexDraftEmpty'),
})

function openVisualQueryBuilder() {
  const connId = connectionId.value || props.tab.connectionId
  const database = databaseName.value
  if (!connId || !database) {
    workspace.setStatus(t('console.visualQuery.needConnection'))
    return
  }
  visualQueryBuilderOpen.value = true
}

function applyVisualQuerySql(generatedSql: string, mode: 'replace' | 'insert') {
  const next = generatedSql.trim()
  if (!next) return
  if (mode === 'replace') {
    setConsoleSql(next)
    layout.showSuccessToast(t('console.visualQuery.appliedReplace'))
    return
  }
  const current = sql.value.trim()
  setConsoleSql(current ? `${current}\n\n${next}` : next)
  layout.showSuccessToast(t('console.visualQuery.appliedInsert'))
}

function applyAndRunVisualQuerySql(generatedSql: string) {
  const next = generatedSql.trim()
  if (!next) return
  setConsoleSql(next)
  layout.showSuccessToast(t('console.visualQuery.appliedAndRun'))
  executeSql(next, {perfSource: 'vqb'})
}

function onVisualQueryTextToSql(prompt: string) {
  const text = prompt.trim()
  if (!text) return
  void aiLayerRef.value?.openAiInput(text)
}

const databaseName = computed(() => {
  // Depend on connection/instance ids (not explorer.treeVersion) so unrelated tree bumps
  // do not invalidate execute options / recent-query watches.
  return resolveConsoleInstanceLabel({
    activeInstanceLabel: activeInstance.value?.label,
    instanceId: instanceId.value,
    tabInstanceId: props.tab.instanceId,
    tabDatabase: props.tab.database,
    findNodeLabel: (nodeId) => explorer.findNode(nodeId)?.label,
    resolveScopedLabel: buildExplorerScopedLabelResolver(explorer.tree, (nodeId) => explorer.findNode(nodeId)),
  })
})

const dbDialect = computed(() => source.value?.dbType)

watch(
    [() => shortcutPanel.sqlLogs, connectionId, databaseName],
    () => {
      const connId = connectionId.value || props.tab.connectionId
      const database = databaseName.value
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
    {immediate: true, deep: true},
)

const connectionEnvironment = computed(() => {
  const connId = connectionId.value || props.tab.connectionId
  if (!connId) return normalizeConnectionEnvironment(null, null).env
  const node = explorer.findNode(connId)
  return normalizeConnectionEnvironment(node?.env, node?.envCustom).env
})

const {productionPerfActive} = useProductionPerfMode(() => connectionId.value || props.tab.connectionId)

const {caps: connectionCaps, hint: capabilityHint} = useConnectionCapabilities(dbDialect)

const {
  pending: dangerousSqlPending,
  pendingSql: dangerousSqlPendingSql,
  preview: dangerousSqlPreview,
  loading: dangerousSqlLoading,
  affectedCount: dangerousSqlAffectedCount,
  sampleRows: dangerousSqlSampleRows,
  sampleColumns: dangerousSqlSampleColumns,
  errorMessage: dangerousSqlErrorMessage,
  productionForced: dangerousSqlProductionForced,
  requiresConfirmation: requiresDangerousSqlConfirmation,
  armPending: armDangerousSqlPending,
  disarm: disarmDangerousSqlPending,
} = useDangerousSqlPending(async (previewSql) => {
  const connId = connectionId.value || props.tab.connectionId
  if (!connId) {
    throw new Error(t('console.connectionRequired'))
  }
  const result = await sqlApi.execute(previewSql, {
    connectionId: connId,
    database: databaseName.value,
    sessionKey: props.tab.id,
    pageSize: DANGEROUS_SQL_PREVIEW_ROWS,
    maxRows: DANGEROUS_SQL_PREVIEW_ROWS,
  })
  return {
    rows: result.rows ?? [],
    columns: result.columns ?? [],
  }
}, {
  shouldConfirm: (_sql, preview) => shouldConfirmDangerousSql(preview, {
    env: connectionEnvironment.value,
    preferences: appConfig.dangerousSqlPreferences,
  }),
  productionForced: () => connectionEnvironment.value === 'prod',
})

const teamStore = useTeamStore()
const productionApprovalDialogOpen = ref(false)
const productionApprovalSubmitting = ref(false)
const productionApprovalError = ref('')
/** Prod write SQL that skipped the dangerous-confirm bar (INSERT / ALTER / CREATE…). */
const productionApprovalSql = ref<string | null>(null)
const sqlReviewFindings = ref<SqlReviewFinding[]>([])
const sqlReviewBlocked = ref(false)
const sqlReviewSuggestedSql = ref<string | null>(null)
const sqlReviewRewriteNote = ref<string | null>(null)
const sqlReviewRewriteLoading = ref(false)

const approvalContextSql = computed(
    () => dangerousSqlPendingSql.value?.trim() || productionApprovalSql.value?.trim() || '',
)

function promptProductionApproval(sqlText: string) {
  const trimmed = sqlText.trim()
  if (!trimmed) return
  productionApprovalError.value = ''
  productionApprovalSql.value = trimmed
  productionApprovalDialogOpen.value = true
}

function clearProductionApprovalPrompt() {
  productionApprovalSql.value = null
  productionApprovalError.value = ''
  productionApprovalDialogOpen.value = false
}

const {runSql, saveConsole, formatSql, formatSelection, jumpToErrorLine, running} = useSqlEditorActions({
  getTabId: () => props.tab.id,
  getSql: () => sql.value,
  getSqlFile: () => props.tab.sqlFile,
  getConnectionId: () => connectionId.value || props.tab.connectionId,
  getInstanceId: () => instanceId.value ?? props.tab.instanceId,
  getDatabase: () => databaseName.value,
  getConnectionLabel: () => source.value?.label ?? t('common.unnamedConnection'),
  getInstanceLabel: () => databaseName.value,
  getDbType: () => dbDialect.value,
  editorRef: () => editorRef.value ?? null,
  onExecuteComplete: () => {
    void transactionBarRef.value?.refreshStatus()
  },
  onProductionApprovalRequired: (blockedSql) => {
    promptProductionApproval(blockedSql)
  },
  applyParameters: (text) => applySqlParameters(text, sqlParamValues.value),
  getProductionPerfActive: () => productionPerfActive.value,
  getSchema: () => getActiveSqlEditorRuntime().getSchema(),
})

const showToolbarRunGroup = computed(() =>
    can(FeaturePermission.WorkbenchConsoleRun)
    || (explainPlanEnabled.value && can(FeaturePermission.WorkbenchConsoleExplain))
    || can(FeaturePermission.WorkbenchConsoleDangerousSql)
    || (running.value && can(FeaturePermission.WorkbenchConsoleRun)),
)

const showToolbarSaveGroup = computed(() =>
    can(FeaturePermission.WorkbenchConsoleSave)
    || can(FeaturePermission.WorkbenchConsoleSaveAs)
    || (bookmarksEnabled.value && can(FeaturePermission.WorkbenchConsoleBookmark))
    || can(FeaturePermission.WorkbenchConsoleViewModel)
    || (sqlFormatEnabled.value && can(FeaturePermission.WorkbenchConsoleFormat))
    || can(FeaturePermission.WorkbenchConsoleFullscreen),
)

const showToolbarAiGroup = computed(() =>
    consoleAiEnabled.value && can(FeaturePermission.WorkbenchConsoleAi),
)

const productionApprovalTeams = computed(() => {
  const pendingSql = approvalContextSql.value
  if (!pendingSql) return []
  return resolveProductionApprovalTeams({
    env: connectionEnvironment.value,
    sql: pendingSql,
    connectionId: connectionId.value || props.tab.connectionId,
    teams: teamStore.teams,
  })
})

const needsProductionApproval = computed(() => productionApprovalTeams.value.length > 0)

const dangerousSqlSubmitTitle = computed(() =>
    needsProductionApproval.value
        ? t('console.productionApproval.submitForApproval')
        : t('console.dangerousSql.submit'),
)

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

const runningElapsedMs = ref(0)
let runningElapsedTimer: ReturnType<typeof setInterval> | null = null

watch(running, (isRunning) => {
  if (runningElapsedTimer) {
    clearInterval(runningElapsedTimer)
    runningElapsedTimer = null
  }
  if (!isRunning) {
    runningElapsedMs.value = 0
    return
  }
  const startedAt = Date.now()
  runningElapsedMs.value = 0
  runningElapsedTimer = setInterval(() => {
    runningElapsedMs.value = Date.now() - startedAt
  }, 200)
})

onBeforeUnmount(() => {
  if (runningElapsedTimer) {
    clearInterval(runningElapsedTimer)
    runningElapsedTimer = null
  }
})

const runningElapsedLabel = computed(() =>
    running.value ? formatDurationMs(runningElapsedMs.value) : '',
)

const {isFullscreen: isEditorFullscreen, toggle: toggleEditorFullscreen, exit: exitEditorFullscreen} =
    useEditorFullscreen()

/** 全屏编辑时执行 SQL 需先退出全屏，才能看到结果区 */
function resolveConsoleExecutable(executableOverride?: unknown, mode?: SqlExecuteMode) {
  return resolveExecutableSql(
      executableOverride,
      () => editorRef.value?.getSelectedText() ?? '',
      {
        mode,
        fallbackToCurrentLineSql: () => editorRef.value?.getCurrentLineSql() ?? '',
        getCurrentLineNumber: () => editorRef.value?.getCurrentLineNumber() ?? null,
        fallbackToFullDocument: () => sql.value,
        getSelectionStartLine: () => editorRef.value?.getSelectionStartLine() ?? null,
      },
  )
}

function batchNeedsDangerousConfirmation(resolvedSql: string): boolean {
  const statements = splitSqlStatements(resolvedSql)
  const batch = statements.length > 1 ? statements : [statements[0] ?? resolvedSql]
  return batch.some((statement) => requiresDangerousSqlConfirmation(statement.trim()))
}

async function loadSqlReviewFindings(resolvedSql: string) {
  sqlReviewFindings.value = []
  sqlReviewBlocked.value = false
  sqlReviewSuggestedSql.value = null
  sqlReviewRewriteNote.value = null
  const connId = connectionId.value || props.tab.connectionId
  if (!connId) return
  sqlReviewRewriteLoading.value = true
  try {
    const result = await reviewSql(
        {
          sql: resolvedSql,
          connectionId: connId,
          database: databaseName.value,
          aiRewrite: true,
        },
        {silent: true},
    )
    sqlReviewFindings.value = result.findings ?? []
    sqlReviewBlocked.value = !result.allowed
    sqlReviewSuggestedSql.value = result.suggestedSql?.trim() || null
    sqlReviewRewriteNote.value = result.rewriteNote?.trim() || null
  } catch {
    sqlReviewFindings.value = []
    sqlReviewBlocked.value = false
    sqlReviewSuggestedSql.value = null
    sqlReviewRewriteNote.value = null
  } finally {
    sqlReviewRewriteLoading.value = false
  }
}

function applySqlReviewSuggestion() {
  const suggested = sqlReviewSuggestedSql.value?.trim()
  if (!suggested) return
  sql.value = suggested
  editorRef.value?.layout()
  workspace.setStatus(t('platform.sqlReview.appliedRewrite'))
  void loadSqlReviewFindings(suggested)
}

async function armDangerousSqlWithReview(resolved: string) {
  await loadSqlReviewFindings(resolved)
  await armDangerousSqlPending(resolved)
}

function executeSql(executableOverride?: unknown, runOptions?: SqlRunOptions) {
  if (isEditorFullscreen.value) {
    exitEditorFullscreen()
  }
  if (!runOptions?.skipDangerousCheck) {
    const {sql: executable} = resolveConsoleExecutable(executableOverride, runOptions?.mode)
    const trimmed = executable.trim()
    if (trimmed) {
      const resolved = applySqlParameters(trimmed, sqlParamValues.value)
      if (batchNeedsDangerousConfirmation(resolved)) {
        void armDangerousSqlWithReview(resolved)
        return
      }
      // INSERT / ALTER / CREATE etc. skip the dangerous bar but still need prod approval.
      const approvalTeams = resolveProductionApprovalTeams({
        env: connectionEnvironment.value,
        sql: resolved,
        connectionId: connectionId.value || props.tab.connectionId,
        teams: teamStore.teams,
      })
      if (approvalTeams.length > 0) {
        promptProductionApproval(resolved)
        return
      }
    }
  }
  sqlReviewFindings.value = []
  sqlReviewBlocked.value = false
  sqlReviewSuggestedSql.value = null
  sqlReviewRewriteNote.value = null
  runSql(executableOverride, runOptions)
}

function runWithMode(mode: SqlExecuteMode) {
  executeSql(undefined, {perfSource: 'toolbar', mode})
}

function resolveToolbarStatementSql(): string {
  const selected = editorRef.value?.getSelectedText?.()?.trim()
  if (selected) return selected
  return editorRef.value?.getCurrentLineSql?.()?.trim() || sql.value.trim()
}

function onRunStatementFromGutter(payload: { sql: string; anchorLine: number }) {
  executeSql(payload.sql, {perfSource: 'gutter'})
}

function runExplainPlanFromToolbar(event?: MouseEvent) {
  const targetSql = resolveToolbarStatementSql()
  const trimmed = targetSql.trim()
  if (!trimmed) return
  if (!explainPlanEnabled.value) return
  if (!connectionCaps.value.sqlExplain) {
    workspace.setStatus(capabilityHint('sqlExplain'))
    return
  }

  const analyze = Boolean(event?.shiftKey) && supportsExplainAnalyze(dbDialect.value)
  const wrapped = wrapExplainSql(trimmed, dbDialect.value, analyze)
  executeSql(wrapped, {skipDangerousCheck: true, perfSource: 'explain'})
}

async function saveStatementAsFileFromToolbar() {
  if (guestReadOnly.value) {
    workspace.setStatus(guestReadOnlyHint.value)
    return
  }
  const statementSql = resolveToolbarStatementSql()
  if (!statementSql) return
  const ok = await workspace.saveConsoleStatementAsFile(props.tab.id, statementSql)
  if (!ok) {
    workspace.setStatus(t('console.saveFailed'))
  }
}

function submitDangerousSql() {
  if (!dangerousSqlPending.value || !dangerousSqlPendingSql.value) return
  if (needsProductionApproval.value) {
    productionApprovalError.value = ''
    productionApprovalDialogOpen.value = true
    return
  }
  const pending = dangerousSqlPendingSql.value
  disarmDangerousSqlPending()
  executeSql(pending, {skipDangerousCheck: true})
}

async function onSubmitProductionApproval(teamId: string) {
  const pendingSql = approvalContextSql.value
  const connId = connectionId.value || props.tab.connectionId
  if (!pendingSql || !connId) return

  productionApprovalSubmitting.value = true
  productionApprovalError.value = ''
  try {
    await teamStore.submitProductionApproval(teamId, {
      connectionId: connId,
      connectionName: source.value?.label ?? explorer.findNode(connId)?.label,
      database: databaseName.value || undefined,
      sql: pendingSql,
    })
    clearProductionApprovalPrompt()
    disarmDangerousSqlPending()
    layout.showSuccessToast(t('console.productionApproval.submitted'))
  } catch (error) {
    productionApprovalError.value =
        resolveCaughtApiErrorMessage(error, t, 'console.productionApproval.submitFailed')
  } finally {
    productionApprovalSubmitting.value = false
  }
}

function onProductionApprovalDialogOpen(open: boolean) {
  productionApprovalDialogOpen.value = open
  if (!open) {
    productionApprovalSql.value = null
    productionApprovalError.value = ''
  }
}

function rollbackDangerousSql() {
  disarmDangerousSqlPending()
  clearProductionApprovalPrompt()
}

function requestExplainPlan(targetSql: string) {
  const trimmed = targetSql.trim()
  if (!trimmed) return
  if (!explainPlanEnabled.value) return
  if (!connectionCaps.value.sqlExplain) {
    workspace.setStatus(capabilityHint('sqlExplain'))
    return
  }
  const wrapped = wrapExplainSql(trimmed, dbDialect.value, false)
  executeSql(wrapped, {skipDangerousCheck: true})
}

function openCrossEnvCompareFromResult(index: number) {
  const result = consoleQuery.value.results[index]
  const connId = connectionId.value || props.tab.connectionId
  const database = databaseName.value
  if (!connId || !database || !result?.sql?.trim()) return

  const sqlError = validateCrossEnvCompareSql(result.sql)
  if (sqlError) {
    workspace.setStatus(t(`crossEnvCompare.errors.${sqlError}`))
    return
  }

  const scope = buildCrossEnvCompareScope({
    connectionId: connId,
    connectionLabel: source.value?.label ?? explorer.findNode(connId)?.label ?? connId,
    database,
    dbType: dbDialect.value ?? 'mysql',
  })
  workspace.openCrossEnvCompare({left: scope, sql: result.sql})
}

const {
  visible: editorMenuVisible,
  position: editorMenuPos,
  menuItems: editorMenuItems,
  show: showEditorContextMenu,
  close: closeEditorMenu,
  selectMenuItem: onEditorMenuSelect,
} = useEditorContextMenu({
  editorRef: () => editorRef.value ?? null,
  runSql: (sql) => executeSql(sql, {perfSource: 'context-menu'}),
  requestExplainPlan,
  formatSelection,
  openAiInput: (prefill) => {
    if (prefill?.includes('\n')) {
      const lines = prefill.split('\n')
      aiSelectionSql.value = lines.slice(1).join('\n').trim()
    }
    void aiLayerRef.value?.openAiInput(prefill)
  },
  getDbType: () => dbDialect.value,
  getCapabilities: () => connectionCaps.value,
  getCapabilityHint: () => capabilityHint('sqlExplain'),
  getExplainPlanEnabled: () => explainPlanEnabled.value,
  getIndexSuggestEnabled: () => true,
  getPreviewRowCount: () => DEFAULT_TABLE_SHORTCUT_ROWS,
  onTableShortcutInvalid: () => {
    layout.showWarningToast(t('console.tableShortcutInvalid'))
  },
  requestIndexSuggest: (targetSql) => {
    requestIndexDraft({sql: targetSql})
  },
})

function runTableShortcutFromSelection(kind: 'select-first' | 'count') {
  const selected = editorRef.value?.getSelectedText?.()?.trim() ?? ''
  if (!selected) {
    layout.showWarningToast(t('console.tableShortcutNeedSelection'))
    return
  }
  const sql = buildTableShortcutSql(kind, selected, dbDialect.value, DEFAULT_TABLE_SHORTCUT_ROWS)
  if (!sql) {
    layout.showWarningToast(t('console.tableShortcutInvalid'))
    return
  }
  executeSql(sql, {perfSource: 'shortcut'})
}

function onEditorContextMenu(payload: { x: number; y: number; selectedText: string }) {
  aiSelectionSql.value = payload.selectedText.trim()
  showEditorContextMenu(payload)
}

function onOpenTableFromSql(payload: {tableName: string; tableId?: string; catalog?: string}) {
  void openSqlTableFromPeek(payload, {
    connectionId: connectionId.value || props.tab.connectionId,
    database: databaseName.value,
  })
}

function onRequestAiSummary() {
  const view = consoleQuery.value.activeView
  if (view < 0) return
  const result = consoleQuery.value.results[view]
  if (result) aiLayerRef.value?.onRequestAiSummary(result)
}

function onRequestAiExplain() {
  const view = consoleQuery.value.activeView
  if (view < 0) return
  const result = consoleQuery.value.results[view]
  if (result) aiLayerRef.value?.onRequestAiExplain(result)
}

const consoleQuery = computed(() => {
  const state = consoleQueryByTabId.value[props.tab.id]
  return state ?? {results: [], activeView: -1}
})

watch(
    () => props.tab.sql,
    (value) => {
      if (value !== undefined && value !== sql.value) {
        syncingSqlFromStore = true
        sql.value = value
        void nextTick(() => {
          syncingSqlFromStore = false
        })
      }
    },
)

function onActiveViewChange(view: number) {
  workspace.setConsoleActiveView(props.tab.id, view)
}

function onCloseResult(index: number) {
  workspace.closeConsoleQueryResult(props.tab.id, index)
}

function onCloseOtherResults(index: number) {
  workspace.closeOtherConsoleQueryResults(props.tab.id, index)
}

function onCloseAllResults() {
  workspace.closeAllConsoleQueryResults(props.tab.id)
}

function refreshActiveResult(payload?: QueryResultRefreshRequest) {
  if (!payload) return
  executeSql(payload.sql, {refreshResultIndex: payload.resultIndex, skipDangerousCheck: true})
}

function onRaiseMaxRows(maxRows: number) {
  const view = consoleQuery.value.activeView
  if (view < 0) return
  const result = consoleQuery.value.results[view]
  if (!result?.sql?.trim()) return
  executeSql(result.sql, {
    refreshResultIndex: view,
    skipDangerousCheck: true,
    maxRowsOverride: maxRows,
  })
}

const lastOrderFill = ref<{column: string; direction: 'asc' | 'desc'} | null>(null)

function onInsertOrderByFromResult(payload: {column: string; direction: 'asc' | 'desc'}) {
  const editor = editorRef.value
  if (!editor) return
  const direction = payload.direction === 'desc'
      ? 'desc'
      : nextOrderDirection(lastOrderFill.value, payload.column)
  lastOrderFill.value = {column: payload.column, direction}
  editor.insertTextAtCursor(buildOrderByFillInsert(payload.column, direction))
  layout.showSuccessToast(t('console.sqlFillInserted'))
}

function onInsertWhereFromResult(payload: {column: string; value: unknown}) {
  const editor = editorRef.value
  if (!editor) return
  const statement = editor.getCurrentLineSql?.()?.trim() || sql.value
  editor.insertTextAtCursor(buildWhereFillInsert(statement, payload.column, payload.value))
  layout.showSuccessToast(t('console.sqlFillInserted'))
}

function onInsertWhereInFromResult(payload: {column: string; clause: string}) {
  const editor = editorRef.value
  if (!editor) return
  const statement = editor.getCurrentLineSql?.()?.trim() || sql.value
  const text = buildWhereInFillInsert(statement, payload.clause)
  if (!text) return
  editor.insertTextAtCursor(text)
  layout.showSuccessToast(t('console.sqlFillInserted'))
}

function resolveActiveResultSql(): string {
  const view = consoleQuery.value.activeView
  if (view < 0) return sql.value
  const result = consoleQuery.value.results[view]
  return result?.sql?.trim() || sql.value
}

function replaceEditorSql(nextSql: string) {
  sql.value = nextSql
  editorRef.value?.layout()
  layout.showSuccessToast(t('console.sqlRewriteApplied'))
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
  if (!result?.cursorId || cursorLoading.value || running.value) return
  const tabId = props.tab.id
  const runGeneration = workspace.beginConsoleRun(tabId)
  cursorLoading.value = true
  try {
    const page = await sqlApi.fetchCursorPage(
        result.cursorId,
        result.pageSize ?? resolveSqlPageSize(productionPerfActive.value),
    )
    if (!workspace.isConsoleRunCurrent(tabId, runGeneration)) return
    const clientMax = resolveClientMaxResultRows(productionPerfActive.value)
    workspace.appendConsoleQueryResultPage(
        tabId,
        index,
        mergeCursorPageIntoQueryResult(result, page, {
          maxRows: resolveCursorLoadedRowsMax(productionPerfActive.value),
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
    cursorLoading.value = false
  }
}

watch(isEditorFullscreen, async () => {
  await nextTick()
  editorRef.value?.layout()
})

watch(sql, (value) => {
  if (syncingSqlFromStore) return
  if (value === props.tab.sql) return
  workspace.updateTabSql(props.tab.id, value)
  if (dangerousSqlPending.value) {
    disarmDangerousSqlPending()
  }
})

watch(running, (isRunning) => {
  if (isRunning) expandResultPanel()
})

watch(
    () => workspace.consoleAutoRunRequest,
    (req) => {
      if (!req || req.tabId !== props.tab.id) return
      workspace.clearConsoleAutoRun()
      void nextTick(() => {
        executeSql(undefined, {perfSource: 'context-menu'})
      })
    },
)

function onEditorDragOver(event: DragEvent) {
  // Default: open file on drop. Hold Alt to insert path at cursor instead.
  if (event.altKey && dataTransferHasType(event.dataTransfer, LOCAL_FILE_PATH_MIME)) {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    return
  }
  if (!dataTransferHasType(event.dataTransfer, LOCAL_FILE_ABS_PATH_MIME)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onEditorDrop(event: DragEvent) {
  if (event.altKey) {
    const insertPath = readLocalFilePathFromDataTransfer(event.dataTransfer)
    if (!insertPath) return
    event.preventDefault()
    event.stopPropagation()
    editorRef.value?.insertTextAtCursor(insertPath)
    return
  }
  const path = readLocalAbsPathFromDataTransfer(event.dataTransfer)
  if (!path) return
  event.preventDefault()
  event.stopPropagation()
  void openLocalWorkspaceFile(path)
}

watch(
    () => consoleQuery.value.results.length,
    (count, prev) => {
      if (count > 0 && count !== prev) {
        expandResultPanel()
        return
      }
      // 结果清空且未在执行 → 收到底部（叉掉结果 / 新开工作台）
      if (count === 0 && !running.value) {
        collapseResultPanel()
      }
    },
)

watch([connectionId, instanceId], ([conn, inst]) => {
  const database = activeInstance.value?.label ?? props.tab.database
  if (
      conn === (props.tab.connectionId ?? '')
      && (inst ?? null) === (props.tab.instanceId ?? null)
      && database === props.tab.database
  ) {
    return
  }
  workspace.updateTabContext(props.tab.id, {
    connectionId: conn,
    instanceId: inst,
    database,
  })
}, {flush: 'post'})

useSqlEditorShortcuts(props.tab.id, () => ({
  'workspace.runSql': () => executeSql(undefined, {perfSource: 'shortcut'}),
  'workspace.selectFirstRows': () => runTableShortcutFromSelection('select-first'),
  'workspace.countRows': () => runTableShortcutFromSelection('count'),
  'workspace.saveConsole': saveConsole,
  'workspace.aiPrompt': consoleAiEnabled.value ? () => void aiLayerRef.value?.openAiInput() : undefined,
}))

function clampEditorHeight(value: number) {
  const splitEl = splitRef.value
  const maxByPane = splitEl
      ? Math.max(CONSOLE_EDITOR_HEIGHT_MIN, splitEl.clientHeight - CONSOLE_RESULT_MIN_HEIGHT - 4)
      : CONSOLE_EDITOR_HEIGHT_MAX
  const max = Math.min(CONSOLE_EDITOR_HEIGHT_MAX, maxByPane)
  return Math.min(max, Math.max(CONSOLE_EDITOR_HEIGHT_MIN, value))
}

onMounted(async () => {
  layout.setModule('database')
  // 打开/切回工作台：仅当本 Tab 有结果或正在查询时展开
  if (running.value || consoleQuery.value.results.length > 0) {
    expandResultPanel()
  } else {
    collapseResultPanel()
  }
  await ensureSqlEditorPlugin()
  if (!splitRef.value) {
    requestAnimationFrame(() => {
      editorReady.value = true
    })
    return
  }
  if (appConfig.consoleEditorHeight === CONSOLE_EDITOR_HEIGHT_DEFAULT) {
    editorHeight.value = clampEditorHeight(
        Math.round(splitRef.value.clientHeight * CONSOLE_EDITOR_HEIGHT_RATIO),
    )
  }
  requestAnimationFrame(() => {
    editorReady.value = true
  })
})

</script>

<template>
  <div class="console-tab dw-workbench-page" data-wb-recipe="wb-editor-results" :class="{ 'is-editor-fullscreen': isEditorFullscreen }">
    <div class="dw-console-toolbar">
      <div class="dw-console-actions dw-btn-group">
        <ConsoleRunSplitButton
            v-if="can(FeaturePermission.WorkbenchConsoleRun)"
            :running="running"
            :disabled="dangerousSqlPending"
            :run-title="dangerousSqlPending
              ? t('console.dangerousSql.pendingRunBlocked')
              : shortcutTooltip(t('console.run'), 'workspace.runSql')"
            :cancel-title="t('console.cancelExecution.cancelQueryHint')"
            @run="executeSql(undefined, {perfSource: 'toolbar'})"
            @cancel="cancelQueryNow()"
            @run-with-mode="runWithMode"
        />
        <span
            v-if="running && runningElapsedLabel"
            class="console-run-elapsed"
            :title="t('console.runningElapsed', {duration: runningElapsedLabel})"
        >
          {{ runningElapsedLabel }}
        </span>
        <IconButton
            v-if="explainPlanEnabled && can(FeaturePermission.WorkbenchConsoleExplain)"
            :disabled="!connectionCaps.sqlExplain"
            :title="connectionCaps.sqlExplain
              ? t('console.explainMode.toolbar')
              : capabilityHint('sqlExplain')"
            @click="runExplainPlanFromToolbar"
        >
          <ConsoleToolbarIcon name="explainPlan"/>
        </IconButton>
        <IconButton
            v-if="can(FeaturePermission.WorkbenchConsoleDangerousSql)"
            :disabled="!dangerousSqlPending"
            :variant="dangerousSqlPending ? 'accent' : undefined"
            :title="dangerousSqlSubmitTitle"
            @click="submitDangerousSql"
        >
          <ConsoleToolbarIcon name="submit"/>
        </IconButton>
        <IconButton
            v-if="can(FeaturePermission.WorkbenchConsoleDangerousSql)"
            :disabled="!dangerousSqlPending"
            :title="t('console.dangerousSql.rollback')"
            @click="rollbackDangerousSql"
        >
          <ConsoleToolbarIcon name="rollback"/>
        </IconButton>
        <IconButton
            v-if="running && can(FeaturePermission.WorkbenchConsoleRun)"
            class="console-disconnect-btn"
            :title="t('console.cancelExecution.cancelConnectionHint')"
            @click="requestCancelConnection()"
        >
          <ConsoleToolbarIcon name="disconnect"/>
        </IconButton>
        <IconButton
            v-if="jdbcTunnelSshEnabled"
            :title="t('console.openJdbcSshTunnel')"
            @click="openJdbcTunnelSshTerminal"
        >
          <ConsoleToolbarIcon name="terminal"/>
        </IconButton>
        <span
            v-if="showToolbarRunGroup && showToolbarSaveGroup"
            class="dw-console-divider"
            aria-hidden="true"
        />
        <IconButton
            v-if="can(FeaturePermission.WorkbenchConsoleSave)"
            :disabled="guestReadOnly"
            :title="guestReadOnly ? guestReadOnlyHint : shortcutTooltip(t('console.save'), 'workspace.saveConsole')"
            @click="saveConsole"
        >
          <ConsoleToolbarIcon name="save"/>
        </IconButton>
        <IconButton
            v-if="can(FeaturePermission.WorkbenchConsoleSaveAs)"
            :disabled="guestReadOnly"
            :title="guestReadOnly ? guestReadOnlyHint : t('console.saveAsFile')"
            @click="saveStatementAsFileFromToolbar"
        >
          <ConsoleToolbarIcon name="saveAs"/>
        </IconButton>
        <IconButton
            v-if="bookmarksEnabled && can(FeaturePermission.WorkbenchConsoleBookmark)"
            :title="t('console.saveBookmark')"
            @click="openSaveBookmarkDialog"
        >
          <ConsoleToolbarIcon name="bookmark"/>
        </IconButton>
        <IconButton
            v-if="can(FeaturePermission.WorkbenchConsoleViewModel)"
            :disabled="guestReadOnly"
            :title="t('console.saveViewModel')"
            @click="openSaveViewModelDialog"
        >
          <ConsoleToolbarIcon name="viewModel"/>
        </IconButton>
        <IconButton
            v-if="sqlFormatEnabled && can(FeaturePermission.WorkbenchConsoleFormat)"
            :title="t('console.format')"
            @click="formatSql"
        >
          <ConsoleToolbarIcon name="format"/>
        </IconButton>
        <IconButton
            :title="t('console.foldAll')"
            :aria-label="t('console.foldAll')"
            @click="editorRef?.foldAll()"
        >
          <ConsoleToolbarIcon name="foldAll"/>
        </IconButton>
        <IconButton
            :title="t('console.unfoldAll')"
            :aria-label="t('console.unfoldAll')"
            @click="editorRef?.unfoldAll()"
        >
          <ConsoleToolbarIcon name="unfoldAll"/>
        </IconButton>
        <IconButton
            :title="t('console.sqlEditorSettingsHint')"
            :aria-label="t('console.sqlEditorSettings')"
            @click="editorRef?.openSettings?.()"
        >
          <ConsoleToolbarIcon name="sqlEditorSettings"/>
        </IconButton>
        <IconButton
            v-if="can(FeaturePermission.WorkbenchConsoleRun)"
            :title="t('console.visualQuery.toolbar')"
            @click="openVisualQueryBuilder"
        >
          <ConsoleToolbarIcon name="visualQuery"/>
        </IconButton>
        <EditorFullscreenButton
            v-if="can(FeaturePermission.WorkbenchConsoleFullscreen)"
            variant="toolbar"
            :active="isEditorFullscreen"
            @click="toggleEditorFullscreen"
        />
        <span
            v-if="showToolbarSaveGroup && showToolbarAiGroup"
            class="dw-console-divider"
            aria-hidden="true"
        />
        <div v-if="showToolbarAiGroup" class="ai-btn-wrap">
          <IconButton
              class="console-ai-btn"
              :title="shortcutTooltip(t('console.ai'), 'workspace.aiPrompt')"
              :active="aiLayerRef?.showAiInput"
              @click="aiLayerRef?.toggleAiInput()"
          >
            <ConsoleToolbarIcon name="ai"/>
          </IconButton>
        </div>
      </div>

      <div class="dw-console-toolbar__context">
        <div class="dw-console-toolbar__controls">
          <SqlExecutionLimitHint/>
          <ConsoleTransactionBar
              v-if="can(FeaturePermission.WorkbenchConsoleTransaction)"
              ref="transactionBarRef"
              :tab-id="tab.id"
              :connection-id="connectionId || tab.connectionId"
              :database="databaseName"
              :can-manage="canManageTransactions"
          />
        </div>
        <span class="dw-console-divider" aria-hidden="true"/>
        <div class="dw-console-toolbar__info">
          <ConsoleCtxBar
              class="dw-console-toolbar__ctx"
              v-model:connection-id="connectionId"
              v-model:instance-id="instanceId"
              :data-sources="dataSources"
              :bound-database-label="tab.database"
              :context-locked="workspaceBound"
              :bound-connection-label="source?.label ?? explorer.findNode(tab.connectionId ?? '')?.label"
              :bound-connection-db-type="dbDialect"
          />
        </div>
      </div>
    </div>

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

    <div ref="splitRef" class="split dw-seam-stack dw-seam-stack--flush">
      <div
          class="editor-pane"
          :class="{
          'editor-pane--fullscreen': isEditorFullscreen,
          'editor-pane--expanded': !isEditorFullscreen && !showResultPanel,
        }"
          :style="!isEditorFullscreen && showResultPanel ? { height: `${editorHeight}px` } : undefined"
      >
        <SqlConsoleAiLayer
            v-if="editorReady && anyAiFeatureEnabled"
            ref="aiLayerRef"
            v-model:selection-sql="aiSelectionSql"
            :tab="tab"
            :get-sql="getConsoleSql"
            :set-sql="setConsoleSql"
            :connection-id="connectionId || tab.connectionId || ''"
            :database-name="databaseName ?? ''"
            :db-dialect="dbDialect"
            :source-label="source?.label ?? ''"
            :active-instance-label="activeInstance?.label ?? null"
            :console-ai-enabled="consoleAiEnabled"
            :ai-sql-fix-enabled="aiSqlFixEnabled"
            :index-suggest-enabled="indexSuggestEnabled"
            :ai-result-summary-enabled="aiResultSummaryEnabled"
            :ai-explain-enabled="aiExplainEnabled"
            :get-editor="getSqlEditor"
        />
        <SqlParameterPanel
            :parameter-names="parameterNames"
            :values="sqlParamValues"
            @update:values="sqlParamValues = $event"
        />
        <div
            class="editor-surface"
            @dragover.capture="onEditorDragOver"
            @drop.capture="onEditorDrop"
        >
          <SqlEditor
              v-if="editorReady"
              ref="editorRef"
              v-model="sql"
              :connection-id="connectionId || tab.connectionId"
              :database-name="databaseName"
              :schema-provider="schemaProvider"
              :dialect="dbDialect"
              @contextmenu="onEditorContextMenu"
              @run-statement="onRunStatementFromGutter"
              @open-table="onOpenTableFromSql"
          />
          <DwPanelState
              v-else
              class="editor-surface__loading"
              status="loading"
              fill
              compact
              :message="t('common.editorLoading')"
          />
        </div>
      </div>
      <ResizeHandle
          v-if="!isEditorFullscreen && showResultPanel"
          v-model="editorHeight"
          direction="horizontal"
          variant="line"
          :min="CONSOLE_EDITOR_HEIGHT_MIN"
          :max="CONSOLE_EDITOR_HEIGHT_MAX"
      />
      <QueryResultPane
          v-if="!isEditorFullscreen && showResultPanel"
          class="result-pane"
          collapsible
          :results="consoleQuery.results"
          :active-view="consoleQuery.activeView"
          always-show-overview
          :running="running"
          :running-elapsed-ms="runningElapsedMs"
          closable-results
          :enable-dml-generate="dmlGenerateEnabled"
          :dml-connection-id="connectionId || tab.connectionId"
          :dml-connection-name="source?.label"
          :dml-database="databaseName"
          :enable-ai-fix="aiSqlFixEnabled"
          :ai-fix-loading="aiLayerRef?.aiFixLoading ?? false"
          :enable-ai-summary="aiResultSummaryEnabled"
          :ai-summary-loading="aiLayerRef?.aiSummaryLoading ?? false"
          :ai-summary-open="aiLayerRef?.aiSummaryOpen ?? false"
          :ai-summary-text="aiLayerRef?.aiSummaryText ?? ''"
          :enable-ai-index-suggest="indexSuggestEnabled"
          :ai-index-suggest-loading="aiLayerRef?.aiIndexSuggestLoading ?? false"
          :enable-ai-explain="aiExplainEnabled"
          :ai-explain-loading="aiLayerRef?.aiExplainLoading ?? false"
          :ai-explain-open="aiLayerRef?.aiExplainOpen ?? false"
          :ai-explain-text="aiLayerRef?.aiExplainText ?? ''"
          :enable-cross-env-compare="crossEnvCompareEnabled && Boolean((connectionId || tab.connectionId) && databaseName)"
          :db-type="dbDialect"
          :export-suggest-mask="connectionEnvironment === 'prod'"
          :production-perf-active="productionPerfActive"
          :cursor-loading="cursorLoading"
          enable-sql-fill
          @collapse="collapseResultPanel"
          @update:active-view="onActiveViewChange"
          @close-result="onCloseResult"
          @close-other-results="onCloseOtherResults"
          @close-all-results="onCloseAllResults"
          @jump-to-error-line="jumpToErrorLine"
          @request-ai-fix="(payload) => aiLayerRef?.requestAiSqlFix(payload)"
          @request-ai-summary="onRequestAiSummary"
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
      <button
          v-if="!isEditorFullscreen && !showResultPanel"
          type="button"
          class="result-collapsed-bar"
          :title="t('queryResult.expandPanel')"
          @click="expandResultPanel"
      >
        <span class="result-collapsed-bar__label">{{ t('queryResult.panelTitle') }}</span>
      </button>
    </div>

    <ContextMenuHost
        :visible="editorMenuVisible"
        :items="editorMenuItems"
        :x="editorMenuPos.x"
        :y="editorMenuPos.y"
        @select="onEditorMenuSelect"
        @close="closeEditorMenu"
    />

    <IndexSuggestDialog
        v-model:open="indexDraftDialogOpen"
        :query-sql="indexDraftQuery"
        :suggested-sql="indexDraftSql"
        @apply="applyIndexDraft"
    />

    <SaveBookmarkDialog
        v-if="bookmarksEnabled"
        v-model:open="bookmarkDialogOpen"
        :default-name="bookmarkDefaults.name"
        :default-connection-name="bookmarkDefaults.connectionName"
        :default-sql="bookmarkDefaults.sql"
        :saving="bookmarkSaving"
        @save="onSaveBookmark"
    />

    <SubmitProductionApprovalDialog
        :open="productionApprovalDialogOpen"
        :saving="productionApprovalSubmitting"
        :error="productionApprovalError"
        :sql="approvalContextSql"
        :connection-name="source?.label ?? ''"
        :database="databaseName"
        :teams="productionApprovalTeams"
        @update:open="onProductionApprovalDialogOpen"
        @submit="onSubmitProductionApproval"
    />

    <VisualQueryBuilderDialog
        v-model:open="visualQueryBuilderOpen"
        :connection-id="connectionId || tab.connectionId"
        :database="databaseName"
        @apply="applyVisualQuerySql"
        @apply-and-run="applyAndRunVisualQuerySql"
        @text-to-sql="onVisualQueryTextToSql"
    />

    <ConsoleSqlCancelDialog
        :open="cancelConfirmOpen"
        :mode="cancelPendingMode"
        :loading="cancelInProgress"
        :error="cancelError"
        @confirm="confirmCancel()"
        @cancel="closeCancelConfirm()"
    />
  </div>
</template>

<style scoped>
.console-run-elapsed {
  margin-left: var(--dw-space-2);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
  min-width: 3.5em;
}

.console-disconnect-btn {
  color: var(--dw-danger);
}

.console-disconnect-btn:hover {
  background: color-mix(in srgb, var(--dw-danger) 10%, var(--dw-bg-muted));
}

.ai-btn-wrap {
  display: inline-flex;
}

.dw-console-toolbar__context {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--dw-gap-xs);
  min-width: 0;
}

.dw-console-toolbar__controls {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  flex-shrink: 0;
}

.dw-console-toolbar__info {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
}

.dw-console-toolbar__ctx {
  min-width: 0;
}

.split {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 120px;
  border-bottom: 1px solid var(--dw-border-light);
}

.editor-surface {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-surface__loading {
  flex: 1;
  min-height: 0;
}

.editor-surface :deep(.sql-editor-hint-bar) {
  height: var(--dw-control-h-sm);
  min-height: var(--dw-control-h-sm);
  max-height: var(--dw-control-h-sm);
  padding: 0 var(--dw-console-chrome-inset);
  gap: var(--dw-gap-sm);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-tab-title-line);
  background: var(--dw-bg-editor);
}

.editor-surface :deep(.sql-editor-hint-bar .hint-text) {
  line-height: var(--dw-tab-title-line);
  padding-bottom: 1px;
}

.editor-surface :deep(.sql-editor-hint-bar .hint-leading) {
  width: 172px;
  min-width: 172px;
  gap: var(--dw-gap-xs);
}

.editor-surface :deep(.sql-editor-hint-bar .hint-badge) {
  height: var(--dw-icon-size-lg);
  padding: 0 var(--dw-space-2);
  font-size: var(--dw-text-2xs);
  line-height: var(--dw-tab-title-line);
}

.editor-surface :deep(.sql-editor-hint-bar .hint-statement) {
  width: 50px;
  min-width: 50px;
}

.editor-surface :deep(.sql-editor-hint-bar .hint-slot) {
  width: 64px;
  min-width: 64px;
}

.editor-surface :deep(.sql-editor-hint-bar .hint-dialect-slot) {
  width: 46px;
  min-width: 46px;
}

.editor-surface :deep(.sql-editor-hint-bar .hint-dialect) {
  width: 46px;
  min-width: 46px;
  height: var(--dw-icon-size-md);
  font-size: var(--dw-text-2xs);
  line-height: var(--dw-tab-title-line);
}

.editor-surface :deep(.sql-editor-hint-bar .hint-chip) {
  min-width: 24px;
  height: var(--dw-icon-size-lg);
  padding: 0 var(--dw-space-2);
  font-size: var(--dw-text-2xs);
  line-height: var(--dw-tab-title-line);
}

.editor-surface :deep(.sql-editor-hint-bar .hint-quick-label) {
  font-size: var(--dw-text-2xs);
}

.editor-surface :deep(.sql-editor) {
  height: 100%;
}

.editor-pane--fullscreen {
  flex: 1;
  min-height: 0;
  border-bottom: none;
}

.editor-pane--expanded {
  flex: 1;
  min-height: 0;
  border-bottom: none;
}

.result-collapsed-bar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  width: 100%;
  height: var(--dw-tab-height);
  padding: 0 var(--dw-space-5);
  border: none;
  border-top: 1px solid var(--dw-tab-bar-border);
  background: var(--dw-tab-bar-bg);
  color: var(--dw-text-secondary);
  font-size: var(--dw-tab-title-size);
  cursor: pointer;
}

.result-collapsed-bar:hover {
  color: var(--dw-text);
  background: var(--dw-bg-hover);
}

.result-collapsed-bar__label {
  font-weight: 500;
}

.console-tab.is-editor-fullscreen .split {
  min-height: 0;
}

.result-pane {
  flex: 1;
  min-height: 140px;
}

.console-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
</style>
