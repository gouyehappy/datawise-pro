<script setup lang="ts">
import {computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {CollapseButton, DwButton, DwInlineAlert, EmptyState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {ContextMenuHost} from '@/core/context-menu'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import TabBar from '@/core/components/TabBar.vue'
import TabItem from '@/core/components/TabItem.vue'
import DataGrid from '@/core/components/DataGrid.vue'
import ExplainPlanTree from '@/features/workspace/components/ExplainPlanTree.vue'
import GenerateDmlDialog from '@/features/workspace/components/GenerateDmlDialog.vue'
import QueryResultDiffPanel from '@/features/workspace/components/QueryResultDiffPanel.vue'
import QueryResultAiSummaryPanel from '@/features/workspace/components/QueryResultAiSummaryPanel.vue'
import QueryResultViewToggle from '@/features/workspace/components/QueryResultViewToggle.vue'
import QueryResultViewOptions from '@/features/workspace/components/QueryResultViewOptions.vue'
import {useClosableTabMenu} from '@/core/composables/useClosableTabMenu'
import type {DbType, TableColumn, TableRow} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import type {GridPendingBatch} from '@/core/composables/useGridPendingEdit'
import type {QueryResultItem} from '@/features/workspace/types'
import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'
import {getResultTabMenu} from '@/features/workspace/constants/tab-context-menu'
import {resolveQueryResultRefreshRequest} from '@/features/workspace/services/query-result-refresh.service'
import type {QueryResultRefreshRequest} from '@/features/workspace/services/query-result-refresh.service'
import {isResultTruncatedAtCap} from '@/features/workspace/services/query-result-truncation'
import {
    FEDERATED_DEFAULT_MAX_ROWS,
    canRaiseFederatedMaxRows,
    nextFederatedMaxRows,
} from '@/features/platform/services/federated-max-rows.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useCommunityPluginContributionStore} from '@/features/community-plugin/stores/community-plugin-contributions'
import {createHttpCommunityPluginsApi} from '@/shared/api/http/community-plugins'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {
    GOVERNANCE_DIFF_PREVIEW_LIMIT,
    isGovernancePreviewLimited,
    limitQueryResultDiffRows,
} from '@/features/pack/services/governance-diff-preview'
import {useGridViewState} from '@/features/workspace/composables/useGridViewState'
import {useEditorSettingsStore} from '@/features/settings/stores/editor-settings'
import {useQueryResultPaneSettingsStore} from '@/features/workspace/stores/query-result-pane-settings'
import {isSlowDurationMs} from '@/features/workspace/services/slow-query.utils'
import {formatDurationMs} from '@/features/workspace/services/sql-stats.service'
import {
    buildQueryResultDiff,
    canCompareQueryResults,
} from '@/features/workspace/services/query-result-diff.service'
import {canVisualizeQueryResult} from '@/features/workspace/services/query-result-chart.service'
import {isNonGridResult} from '@/features/workspace/services/query-result-batch.utils'

/** Chart + echarts stay off the console result critical path until the user switches to chart view. */
const QueryResultChartPanel = defineAsyncComponent(
    () => import('@/features/workspace/components/QueryResultChartPanel.vue'),
)

const MESSAGES_TAB_ID = '__messages__'
const PENDING_RESULT_TAB_ID = '__pending_result__'
/** Console messages tab uses activeView = -1 (same bar as result sets). */
const MESSAGES_VIEW_INDEX = -1

interface MessageLogEntry {
  key: string
  resultIndex: number
  statementNo: number
  sql: string
  status: 'success' | 'error'
  durationMs: number
  total: number
  executedAtMs?: number
  errorMessage?: string
}

const {t} = useI18n()

const props = withDefaults(
    defineProps<{
      results?: QueryResultItem[]
      activeView?: number
      /** 控制台：左侧常显消息面板 */
      alwaysShowOverview?: boolean
      /** 控制台：查询执行中（仅消息区、隐藏结果主区） */
      running?: boolean
      /** 运行中已用时（毫秒），用于 Messages 区展示 */
      runningElapsedMs?: number
      closableResults?: boolean
      collapsible?: boolean
      columns?: TableColumn[]
      rows?: TableRow[]
      total?: number
      where?: string
      orderBy?: string
      showFilter?: boolean
      exportName?: string
      exportSuggestMask?: boolean
      resultLabel?: string
      editable?: boolean
      /** 只读时展示原因（如数据源不支持 DML） */
      readOnlyHint?: string
      canDelete?: boolean
      canUpdate?: boolean
      columnDetails?: TableColumnDetail[]
      pkColumns?: string[]
      tableAutoIncrement?: string | null
      onSubmitChanges?: (batch: GridPendingBatch) => Promise<boolean>
      /** 表数据等场景可指定持久化 scope；默认按结果 Tab id */
      gridStateScope?: string
      resultHasMore?: boolean
      cursorLoading?: boolean
      /** 表数据等：首次加载中 */
      loading?: boolean
      cursorTrimmedRows?: number
      productionPerfActive?: boolean
      enableDmlGenerate?: boolean
      /** DML → console: connection scope for openConsole */
      dmlConnectionId?: string
      dmlConnectionName?: string
      dmlDatabase?: string
      dbType?: DbType
      enableAiFix?: boolean
      aiFixLoading?: boolean
      enableAiSummary?: boolean
      aiSummaryLoading?: boolean
      aiSummaryOpen?: boolean
      aiSummaryText?: string
      enableAiIndexSuggest?: boolean
      aiIndexSuggestLoading?: boolean
      enableAiExplain?: boolean
      aiExplainLoading?: boolean
      aiExplainOpen?: boolean
      aiExplainText?: string
      /** SQL 控制台：结果 Tab 可发起跨环境抽样对比 */
      enableCrossEnvCompare?: boolean
      showExport?: boolean
      enableFakeData?: boolean
      enableRowDocumentView?: boolean
      /** 控制台：结果网格回填 SQL 到编辑器 */
      enableSqlFill?: boolean
    }>(),
    {
      showFilter: true,
      alwaysShowOverview: false,
      running: false,
      closableResults: false,
      exportName: 'query_result.csv',
      editable: false,
      canDelete: false,
      canUpdate: false,
      columnDetails: () => [],
      pkColumns: () => [],
      enableDmlGenerate: false,
      showExport: true,
      enableRowDocumentView: false,
      enableSqlFill: false,
    },
)

const emit = defineEmits<{
  'update:activeView': [number]
  collapse: []
  'close-result': [index: number]
  'close-other-results': [index: number]
  'close-all-results': []
  'jump-to-error-line': [lineNumber: number]
  refresh: [payload?: QueryResultRefreshRequest]
  'load-more': [index: number]
  'request-ai-fix': [payload: { sql: string; errorMessage: string; errorLine?: number }]
  'request-ai-summary': []
  'close-ai-summary': []
  'request-index-suggest': [payload: { sql: string; explainPlan?: ExplainPlanNode[]; table?: string }]
  'request-ai-index-suggest': [payload: { sql: string; explainPlan?: ExplainPlanNode[] }]
  'request-ai-explain': []
  'close-ai-explain': []
  'open-cross-env-compare': [index: number]
  'generate-fake-data': []
  'raise-max-rows': [maxRows: number]
  'insert-order-by': [payload: { column: string; direction: 'asc' | 'desc' }]
  'insert-where': [payload: { column: string; value: unknown }]
  'insert-where-in': [payload: { column: string; clause: string }]
  'rewrite-where': [payload: { column: string; value: unknown }]
  'rewrite-order-by': [payload: { column: string; direction: 'asc' | 'desc' }]
}>()

const layout = useLayoutStore()
const pluginStore = usePluginStore()
const entitlement = useEntitlementStore()
const editorSettings = useEditorSettingsStore()
const resultPaneSettings = useQueryResultPaneSettingsStore()
const communityContributions = useCommunityPluginContributionStore()
const communityResultViews = computed(() => communityContributions.resultViews())
const communityResultMenuOpen = ref(false)
const communityResultMenuRef = ref<HTMLElement | null>(null)
const communityResultTriggerRef = ref<HTMLElement | null>(null)
const tabBarRef = ref<InstanceType<typeof TabBar>>()
const batchSummaryRef = ref<HTMLElement | null>(null)
const settingsMenuOpen = ref(false)
const settingsMenuRef = ref<HTMLElement | null>(null)
const settingsTriggerRef = ref<HTMLElement | null>(null)
const viewOptionsRef = ref<{panelEl: HTMLElement | null} | null>(null)

usePopoverEscape(
    () => settingsMenuOpen.value,
    () => {
      settingsMenuOpen.value = false
    },
    {
      containRefs: () => [
        settingsMenuRef.value,
        settingsTriggerRef.value,
        viewOptionsRef.value?.panelEl ?? null,
      ],
    },
)

usePopoverEscape(
    () => communityResultMenuOpen.value,
    () => {
      communityResultMenuOpen.value = false
    },
    {
      containRefs: () => [
        communityResultMenuRef.value,
        communityResultTriggerRef.value,
      ],
    },
)

function toggleSettingsMenu() {
  settingsMenuOpen.value = !settingsMenuOpen.value
  if (settingsMenuOpen.value) communityResultMenuOpen.value = false
}

function toggleCommunityResultMenu() {
  communityResultMenuOpen.value = !communityResultMenuOpen.value
  if (communityResultMenuOpen.value) settingsMenuOpen.value = false
}

function communityInvokeMessage(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const record = result as Record<string, unknown>
  for (const key of ['message', 'detail', 'status'] as const) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

async function invokeCommunityResultView(pluginId: string, contributionId: string) {
  communityResultMenuOpen.value = false
  const active = typeof currentView.value === 'number'
      ? normalizedResults.value[currentView.value]
      : null
  try {
    const api = createHttpCommunityPluginsApi()
    const result = await api.invoke(pluginId, 'result-view/open', {
      contributionId,
      resultId: active?.id,
      sql: active?.sql,
      status: active?.status,
      rowCount: active?.rows?.length,
      columnCount: active?.columns?.length,
    })
    layout.showSuccessToast(
        communityInvokeMessage(result) || t('communityPlugin.resultViewInvoked'),
    )
  } catch (error) {
    layout.showErrorToast(
        resolveCaughtApiErrorMessage(error, t, 'communityPlugin.resultViewFailed'),
    )
  }
}

function onCommunityPluginChanged() {
  void communityContributions.refresh()
}

onMounted(() => {
  communityContributions.ensureLoaded()
  window.addEventListener('dw-community-plugin-changed', onCommunityPluginChanged)
})

onUnmounted(() => {
  window.removeEventListener('dw-community-plugin-changed', onCommunityPluginChanged)
})

const isConsoleMode = computed(() => props.results !== undefined)
const showMessagesTab = computed(() => isConsoleMode.value && props.alwaysShowOverview)
const resultSortOrder = computed(() => resultPaneSettings.settings.sortOrder)
const showFieldTypes = computed(() => resultPaneSettings.settings.showFieldTypes)
const showFieldComments = computed(() => resultPaneSettings.settings.showFieldComments)

const normalizedResults = computed<QueryResultItem[]>(() => {
  if (isConsoleMode.value) return props.results ?? []
  return [
    {
      id: 'single',
      label: props.resultLabel ?? t('queryResult.resultTab', {n: 1}),
      sql: '',
      columns: props.columns ?? [],
      rows: props.rows ?? [],
      total: props.total ?? 0,
      where: props.where,
      orderBy: props.orderBy,
      durationMs: 0,
      status: 'success' as const,
      cursorTrimmedRows: props.cursorTrimmedRows,
    },
  ]
})

/** Display order for tabs / message log (storage stays chronological). */
const orderedResults = computed(() => {
  const items = normalizedResults.value.map((item, storageIndex) => ({item, storageIndex}))
  if (resultSortOrder.value === 'newest') return items.slice().reverse()
  return items
})

const showGridViewOptions = computed(() => {
  const result = activeResult.value
  if (!result || resultView.value === 'chart') return false
  if (result.explainPlan?.length || result.batchEntries?.length) return false
  if (showExecResultPane.value || activeDiffView.value) return false
  return true
})
const showLayoutViewOption = computed(() =>
    showGridViewOptions.value && (activeResult.value?.rows.length ?? 0) > 0,
)

const {
  menuVisible,
  menuPos,
  menuItems,
  closeMenu,
  onMenuSelect,
  onTabContextMenu,
} = useClosableTabMenu<number>(
    (index) => getResultTabMenu(t, {
      canCompareWithPrevious: canCompareWithPrevious(index),
      canCrossEnvCompare: canCrossEnvCompare(index),
      canSuggestIndex: Boolean(normalizedResults.value[index]?.explainPlan?.length
          && normalizedResults.value[index]?.sql?.trim()),
    }),
    () => ({
      close: (index) => emit('close-result', index),
      closeOthers: (index) => emit('close-other-results', index),
      closeAll: () => emit('close-all-results'),
      compareWithPrevious: (index) => compareWithPrevious(index),
      'cross-env-compare': (index) => emit('open-cross-env-compare', index),
      'suggest-index': (index) => requestIndexDraft(index),
    }),
)

/** 仅 SQL 控制台（有编辑区 + 多结果）需要结果 Tab 栏；直接打开表数据时不显示 */
const showTabBar = computed(() => isConsoleMode.value)

const currentView = computed({
  get: () => {
    if (props.activeView !== undefined) return props.activeView
    return showMessagesTab.value ? MESSAGES_VIEW_INDEX : 0
  },
  set: (value: number) => emit('update:activeView', value),
})

const isMessagesView = computed(() => showMessagesTab.value && currentView.value === MESSAGES_VIEW_INDEX)
const showPendingResultTab = computed(
    () => showMessagesTab.value && props.running && normalizedResults.value.length === 0,
)

const activeTabId = computed<string | null>(() => {
  if (isMessagesView.value) return MESSAGES_TAB_ID
  if (showPendingResultTab.value && currentView.value === 0) return PENDING_RESULT_TAB_ID
  const item = normalizedResults.value[currentView.value]
  return item?.id ?? null
})

const tabsSignature = computed(() => {
  const resultIds = orderedResults.value.map(({item}) => item.id).join(',')
  const pending = showPendingResultTab.value ? `,${PENDING_RESULT_TAB_ID}` : ''
  return showMessagesTab.value ? `${MESSAGES_TAB_ID}${pending},${resultIds}` : resultIds
})

const overflowItems = computed(() => {
  const items = orderedResults.value.map(({item}) => ({id: item.id, label: item.label}))
  if (!showMessagesTab.value) return items
  const head = [{id: MESSAGES_TAB_ID, label: t('queryResult.messages')}]
  if (showPendingResultTab.value) {
    head.push({id: PENDING_RESULT_TAB_ID, label: t('queryResult.resultTab', {n: 1})})
  }
  return [...head, ...items]
})

const activeResult = computed(() => {
  if (isMessagesView.value) return null
  const index = currentView.value
  return normalizedResults.value[index] ?? null
})

const messageLogEntries = computed<MessageLogEntry[]>(() => {
  let statementNo = 0
  // Build in chronological order first so statement numbers stay stable, then apply display sort.
  const chronological: MessageLogEntry[] = []
  normalizedResults.value.forEach((item, resultIndex) => {
    if (item.batchEntries?.length) {
      for (const [batchIndex, entry] of item.batchEntries.entries()) {
        statementNo += 1
        chronological.push({
          key: `${item.id}-batch-${batchIndex}`,
          resultIndex,
          statementNo,
          sql: entry.sql,
          status: entry.status,
          durationMs: entry.durationMs,
          total: entry.total,
          executedAtMs: entry.executedAtMs ?? item.executedAtMs,
          errorMessage: entry.errorMessage,
        })
      }
      return
    }
    statementNo += 1
    chronological.push({
      key: item.id,
      resultIndex,
      statementNo,
      sql: item.sql,
      status: item.status,
      durationMs: item.durationMs,
      total: item.total,
      executedAtMs: item.executedAtMs,
      errorMessage: item.errorMessage,
    })
  })
  if (resultSortOrder.value === 'newest') {
    return chronological.slice().reverse()
  }
  return chronological
})

const generateDmlOpen = ref(false)
const generateDmlRows = ref<TableRow[]>([])
const generateDmlScope = ref<'selected' | 'filtered'>('filtered')
const diffMode = ref<{ baselineIndex: number; currentIndex: number } | null>(null)
const resultView = ref<'grid' | 'chart'>('grid')

function canCompareWithPrevious(index: number): boolean {
    // Wave 38: plugin switch only — Governance soft-limits the preview (not a hard pack hide).
    if (!pluginStore.isSwitchEnabled('p-result-diff')) return false
    if (index <= 0) return false
    const previous = normalizedResults.value[index - 1]
    const current = normalizedResults.value[index]
    return canCompareQueryResults(previous, current)
}

function canCrossEnvCompare(index: number): boolean {
    if (!props.enableCrossEnvCompare) return false
    const current = normalizedResults.value[index]
    if (!current || current.status !== 'success') return false
    if (current.batchEntries?.length || current.explainPlan?.length) return false
    if (!current.columns.length || !current.sql?.trim()) return false
    return true
}

const governanceDiffLimited = computed(() =>
    isGovernancePreviewLimited({
      mode: entitlement.mode,
      governanceUsable: entitlement.isPackUsable('pack.governance'),
    }),
)

const activeDiffPreview = computed(() => {
    if (!diffMode.value) return null
    if (currentView.value !== diffMode.value.currentIndex) return null
    const baseline = normalizedResults.value[diffMode.value.baselineIndex]
    const current = normalizedResults.value[diffMode.value.currentIndex]
    if (!baseline || !current) return null
    // Cap row compare inside the builder so large results never fully stringify first.
    const maxCompareRows = governanceDiffLimited.value
        ? GOVERNANCE_DIFF_PREVIEW_LIMIT
        : undefined
    return limitQueryResultDiffRows(
        buildQueryResultDiff(baseline, current, {maxCompareRows}),
        governanceDiffLimited.value,
    )
})

const activeDiffView = computed(() => activeDiffPreview.value?.diff ?? null)

function compareWithPrevious(index: number) {
    if (!canCompareWithPrevious(index)) {
        layout.showErrorToast(t('queryResult.diffUnavailable'))
        return
    }
    diffMode.value = {baselineIndex: index - 1, currentIndex: index}
    currentView.value = index
    tabBarRef.value?.ensureActiveTabVisible()
}

function exitDiffMode() {
    diffMode.value = null
}

function requestIndexDraft(index?: number, table?: string) {
    const targetIndex = index ?? (typeof currentView.value === 'number' ? currentView.value : -1)
    const result = normalizedResults.value[targetIndex]
    if (!result?.sql?.trim() || !result.explainPlan?.length) return
    emit('request-index-suggest', {
      sql: result.sql,
      explainPlan: result.explainPlan,
      ...(table ? {table} : {}),
    })
}

function requestAiIndexSuggest(index?: number) {
    const targetIndex = index ?? (typeof currentView.value === 'number' ? currentView.value : -1)
    const result = normalizedResults.value[targetIndex]
    if (!result?.sql?.trim() || !result.explainPlan?.length) return
    emit('request-ai-index-suggest', {sql: result.sql, explainPlan: result.explainPlan})
}

const canRequestIndexDraft = computed(() =>
    Boolean(activeResult.value?.explainPlan?.length && activeResult.value.sql?.trim()),
)

const canRequestIndexSuggest = computed(() =>
    props.enableAiIndexSuggest
    && canRequestIndexDraft.value,
)

const canGenerateDml = computed(() => {
  if (!props.enableDmlGenerate || !activeResult.value) return false
  return activeResult.value.status === 'success'
      && activeResult.value.columns.length > 0
      && activeResult.value.rows.length > 0
      && !activeResult.value.explainPlan?.length
})

const canShowFakeData = computed(() => {
  if (!props.enableFakeData) return false
  if (!pluginStore.isEnabled('p-fake-data')) return false
  const columns = props.columnDetails?.length ? props.columnDetails : activeResult.value?.columns
  return Boolean(columns?.length)
})

const canShowResultChart = computed(() => {
  if (diffMode.value) return false
  const result = activeResult.value
  if (!result || result.status !== 'success') return false
  if (result.explainPlan?.length || result.batchEntries?.length) return false
  return canVisualizeQueryResult(result.columns, result.rows)
})

const showExecResultPane = computed(() => {
  const result = activeResult.value
  if (!result || result.status !== 'success') return false
  if (result.explainPlan?.length || result.batchEntries?.length) return false
  return isNonGridResult(result)
})

function onGenerateDml(payload: {rows: TableRow[]; scope: 'selected' | 'filtered'}) {
  if (!entitlement.guardDevProductivity('dev.dml')) return
  generateDmlRows.value = payload.rows
  generateDmlScope.value = payload.scope
  generateDmlOpen.value = true
}

function inferTableFromSql(sql: string): string | undefined {
  const match = sql.match(/\bFROM\s+(?:`([^`]+)`|"([^"]+)"|(\w+))/i)
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

const generateDmlTableName = computed(() => {
  const fromSql = inferTableFromSql(activeResult.value?.sql ?? '')
  if (fromSql) return fromSql
  const label = activeResult.value?.label?.trim()
  if (label && !/^Result\s*\d+$/i.test(label)) return label
  return 'query_result'
})

const gridScope = computed(() => {
  if (props.gridStateScope?.trim()) return props.gridStateScope
  if (activeResult.value?.status === 'success' && activeResult.value.columns.length > 0) {
    return `result:${activeResult.value.id}`
  }
  return null
})

const {viewState} = useGridViewState(gridScope)

const batchSummaryStats = computed(() => {
  const result = activeResult.value
  if (!result?.batchEntries) return null
  return {
    count: result.batchEntries.length,
    totalRows: result.batchEntries.reduce((sum, entry) => sum + entry.total, 0),
    totalDuration: result.batchEntries.reduce((sum, entry) => sum + entry.durationMs, 0),
    total: result.batchTotal ?? result.batchEntries.length,
    running: Boolean(result.batchRunning),
  }
})

function isSlowQueryDuration(durationMs: number) {
  return isSlowDurationMs(durationMs, editorSettings.settings.slowQueryThresholdMs)
}

function formatOutputTimestamp(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return ''
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(' ')
}

function formatOutputMeta(entry: MessageLogEntry): string {
  const duration = t('queryResult.outputDuration', {duration: entry.durationMs})
  if (entry.status === 'error') {
    return duration
  }
  if (entry.total > 0) {
    return t('queryResult.outputRowsDuration', {rows: entry.total, duration: entry.durationMs})
  }
  return t('queryResult.outputOkDuration', {duration: entry.durationMs})
}

watch(tabsSignature, () => {
  diffMode.value = null
  resultView.value = 'grid'
})

watch(currentView, (view) => {
  resultView.value = 'grid'
  if (diffMode.value && view !== diffMode.value.currentIndex) {
    diffMode.value = null
  }
})

watch(
    () => activeResult.value?.batchEntries?.length,
    () => {
      if (!activeResult.value?.batchRunning) return
      requestAnimationFrame(() => {
        const node = batchSummaryRef.value
        if (!node) return
        node.scrollTop = node.scrollHeight
      })
    },
)

function setViewByTabId(tabId: string) {
  if (showMessagesTab.value && tabId === MESSAGES_TAB_ID) {
    currentView.value = MESSAGES_VIEW_INDEX
    return
  }
  if (tabId === PENDING_RESULT_TAB_ID) {
    currentView.value = 0
    return
  }
  const index = normalizedResults.value.findIndex((item) => item.id === tabId)
  if (index >= 0) currentView.value = index
}

function handleTabSelect(tabId: string) {
  setViewByTabId(tabId)
  tabBarRef.value?.ensureActiveTabVisible()
}

function selectResult(index: number) {
  currentView.value = index
  tabBarRef.value?.ensureActiveTabVisible()
}

function closeResult(index: number) {
  emit('close-result', index)
}


function onExported(fileName: string, path?: string) {
  layout.startExport(fileName, path)
}

function onRefresh() {
  const index = currentView.value
  const payload = resolveQueryResultRefreshRequest(activeResult.value, index)
  if (payload) emit('refresh', payload)
}

function onRefreshGrid() {
  if (isConsoleMode.value) {
    onRefresh()
    return
  }
  emit('refresh')
}

const exportBaseName = computed(() => {
  if (activeResult.value?.label) return activeResult.value.label.replace(/\s+/g, '_')
  return props.exportName?.replace(/\.[^.]+$/, '') ?? 'query_result'
})

const exportTableName = computed(() => {
  const label = activeResult.value?.label ?? ''
  const match = label.match(/Result\s*(\d+)/i)
  if (match) return `query_result_${match[1]}`
  return exportBaseName.value
})

function jumpToErrorLine(lineNumber: number) {
  emit('jump-to-error-line', lineNumber)
}

const activeResultIndex = computed(() => currentView.value)

const gridHasMore = computed(() => {
  if (props.resultHasMore != null) return props.resultHasMore
  return Boolean(activeResult.value?.hasMore && activeResult.value?.cursorId)
})

/** Federated JOIN (and similar) set hasMore without a cursor — cannot Load more. */
const gridTruncatedAtCap = computed(() => {
  if (props.resultHasMore != null) return false
  return isResultTruncatedAtCap(activeResult.value)
})

const gridTruncatedCapRows = computed(() => {
  if (!gridTruncatedAtCap.value) return undefined
  const result = activeResult.value
  return result?.pageSize ?? (result?.total ? result.total : undefined)
})

const federatedCapRows = computed(
    () => gridTruncatedCapRows.value ?? FEDERATED_DEFAULT_MAX_ROWS,
)

const canRaiseMaxRows = computed(
    () => gridTruncatedAtCap.value && canRaiseFederatedMaxRows(federatedCapRows.value),
)

const gridCursorLoading = computed(() => props.cursorLoading ?? false)

const gridCursorTrimmedRows = computed(
    () => props.cursorTrimmedRows ?? activeResult.value?.cursorTrimmedRows ?? 0,
)

function onLoadMoreRows() {
  if (activeResultIndex.value < 0) {
    emit('load-more', 0)
    return
  }
  emit('load-more', activeResultIndex.value)
}

function onRaiseMaxRows() {
  const next = nextFederatedMaxRows(federatedCapRows.value)
  if (next == null) return
  emit('raise-max-rows', next)
}

function onRequestAiFix() {
  const result = activeResult.value
  if (!result?.sql?.trim() || !result.errorMessage?.trim()) return
  emit('request-ai-fix', {
    sql: result.sql,
    errorMessage: result.errorMessage,
    errorLine: result.errorLine,
  })
}

const canRequestAiSummary = computed(() => {
  if (!props.enableAiSummary || diffMode.value) return false
  const result = activeResult.value
  if (!result || result.status !== 'success') return false
  if (result.explainPlan?.length || result.batchEntries?.length) return false
  return result.columns.length > 0
})

function onRequestAiSummary() {
  if (!canRequestAiSummary.value) return
  emit('request-ai-summary')
}

const canRequestAiExplain = computed(() => {
  if (!props.enableAiExplain || diffMode.value) return false
  const result = activeResult.value
  return Boolean(result?.explainPlan?.length && result.sql?.trim())
})

function onRequestAiExplain() {
  if (!canRequestAiExplain.value) return
  emit('request-ai-explain')
}

watch(
    () => [props.running, props.results?.length ?? 0, showMessagesTab.value] as const,
    ([isRunning, count, messagesTab]) => {
      if (!messagesTab) return
      // Empty + idle → Messages. While a query is running, keep the result-set slot
      // so the completed result appears there instead of bouncing to Messages.
      if (count === 0 && !isRunning && currentView.value !== MESSAGES_VIEW_INDEX) {
        currentView.value = MESSAGES_VIEW_INDEX
      }
    },
    {immediate: true},
)
</script>

<template>
  <div class="result-pane">
    <div class="result-pane__main">
      <TabBar
          v-if="showTabBar"
          ref="tabBarRef"
          bar-class="result-tab-bar"
          :active-tab-id="activeTabId"
          :tabs-signature="tabsSignature"
          :overflow-items="overflowItems"
          :overflow-title="t('workspace.allTabs')"
          :overflow-search-placeholder="t('workspace.searchTabs')"
          @select="handleTabSelect"
      >
        <template v-if="showMessagesTab" #pinned="{ bindTabRef }">
          <TabItem
              :tab-id="MESSAGES_TAB_ID"
              :title="t('queryResult.messages')"
              :active="isMessagesView"
              :closable="false"
              :set-ref="bindTabRef(MESSAGES_TAB_ID)"
              @select="handleTabSelect(MESSAGES_TAB_ID)"
          >
            <template #leading>
              <DwIcon name="terminal" size="xs" :stroke-width="1.75"/>
            </template>
          </TabItem>
        </template>
        <template #default="{ bindTabRef }">
          <TabItem
              v-if="showPendingResultTab"
              :tab-id="PENDING_RESULT_TAB_ID"
              :title="t('queryResult.resultTab', {n: 1})"
              :active="currentView === 0"
              :closable="false"
              :set-ref="bindTabRef(PENDING_RESULT_TAB_ID)"
              @select="handleTabSelect(PENDING_RESULT_TAB_ID)"
          >
            <template #leading>
              <span class="dw-tab__status dw-tab__status--running" aria-hidden="true"/>
            </template>
          </TabItem>
          <TabItem
              v-for="{item, storageIndex} in orderedResults"
              :key="item.id"
              :tab-id="item.id"
              :title="item.label"
              :active="currentView === storageIndex"
              :closable="closableResults"
              :set-ref="bindTabRef(item.id)"
              @select="handleTabSelect(item.id)"
              @close="closeResult(storageIndex)"
              @contextmenu="onTabContextMenu($event, storageIndex, closableResults)"
          >
            <template #leading>
              <span
                  v-if="item.batchRunning"
                  class="dw-tab__status dw-tab__status--running"
                  aria-hidden="true"
              />
              <span v-else-if="item.status === 'success'" class="dw-tab__status" aria-hidden="true">✓</span>
              <span
                  v-else-if="item.status === 'error'"
                  class="dw-tab__status dw-tab__status--error"
                  aria-hidden="true"
              >✕</span>
            </template>
          </TabItem>
        </template>
        <template #actions>
          <button
              v-if="typeof currentView === 'number' && canCompareWithPrevious(currentView)"
              class="dw-icon-btn result-compare-btn"
              type="button"
              :title="t('queryResult.compareWithPrevious')"
              :aria-label="t('queryResult.compareWithPrevious')"
              @click="compareWithPrevious(currentView)"
          >
            <DwIcon name="arrow-up-down" size="lg" :stroke-width="1.55"/>
          </button>
          <div
              v-if="communityResultViews.length"
              ref="communityResultMenuRef"
              class="result-pane-settings community-result-views"
          >
            <button
                ref="communityResultTriggerRef"
                class="dw-icon-btn result-pane-settings__trigger"
                type="button"
                :title="t('communityPlugin.resultViewMenu')"
                :aria-label="t('communityPlugin.resultViewMenu')"
                :aria-expanded="communityResultMenuOpen"
                :class="{ 'is-open': communityResultMenuOpen }"
                @click="toggleCommunityResultMenu"
            >
              <DwIcon name="star" size="lg" :stroke-width="1.55"/>
            </button>
            <div
                v-if="communityResultMenuOpen"
                class="community-result-views__menu"
                role="menu"
            >
              <button
                  v-for="view in communityResultViews"
                  :key="`${view.pluginId}:${view.id}`"
                  type="button"
                  class="community-result-views__item"
                  role="menuitem"
                  @click="invokeCommunityResultView(view.pluginId, view.id)"
              >
                {{ view.label }}
              </button>
            </div>
          </div>
          <div ref="settingsMenuRef" class="result-pane-settings">
            <button
                ref="settingsTriggerRef"
                class="dw-icon-btn result-pane-settings__trigger"
                type="button"
                :title="t('queryResult.settings.menu')"
                :aria-label="t('queryResult.settings.menu')"
                :aria-expanded="settingsMenuOpen"
                :class="{ 'is-open': settingsMenuOpen }"
                @click="toggleSettingsMenu"
            >
              <DwIcon name="tools" size="lg" :stroke-width="1.55"/>
            </button>
            <QueryResultViewOptions
                v-if="settingsMenuOpen"
                ref="viewOptionsRef"
                :anchor-el="settingsTriggerRef"
                :sort-order="resultSortOrder"
                :keep-existing-results="resultPaneSettings.settings.keepExistingResults"
                :show-field-types="resultPaneSettings.settings.showFieldTypes"
                :show-field-comments="resultPaneSettings.settings.showFieldComments"
                :wrap-cells="resultPaneSettings.settings.wrapCells"
                :result-layout="resultPaneSettings.settings.resultLayout"
                :column-density="resultPaneSettings.settings.columnDensity"
                :numeric-align="resultPaneSettings.settings.numericAlign"
                :hide-null-columns="resultPaneSettings.settings.hideNullColumns"
                :type-coloring="resultPaneSettings.settings.typeColoring"
                :show-grid-options="showGridViewOptions"
                :show-layout-option="showLayoutViewOption"
                @update:sort-order="resultPaneSettings.patchSettings({ sortOrder: $event })"
                @update:keep-existing-results="resultPaneSettings.patchSettings({ keepExistingResults: $event })"
                @update:show-field-types="resultPaneSettings.patchSettings({ showFieldTypes: $event })"
                @update:show-field-comments="resultPaneSettings.patchSettings({ showFieldComments: $event })"
                @update:wrap-cells="resultPaneSettings.patchSettings({ wrapCells: $event })"
                @update:result-layout="resultPaneSettings.patchSettings({ resultLayout: $event })"
                @update:column-density="resultPaneSettings.patchSettings({ columnDensity: $event })"
                @update:numeric-align="resultPaneSettings.patchSettings({ numericAlign: $event })"
                @update:hide-null-columns="resultPaneSettings.patchSettings({ hideNullColumns: $event })"
                @update:type-coloring="resultPaneSettings.patchSettings({ typeColoring: $event })"
            />
          </div>
          <CollapseButton v-if="collapsible" @click="emit('collapse')"/>
        </template>
      </TabBar>

      <div v-if="isMessagesView" class="messages-tab">
        <div class="messages-tab__sub">
          {{ t('queryResult.messagesAll', {count: messageLogEntries.length}) }}
        </div>
        <div class="messages-log">
          <p v-if="running && !messageLogEntries.length" class="messages-running">
            <span class="messages-running__spinner" aria-hidden="true"/>
            {{
              runningElapsedMs != null && runningElapsedMs > 0
                ? t('queryResult.messagesRunningElapsed', {duration: formatDurationMs(runningElapsedMs)})
                : t('queryResult.messagesRunning')
            }}
          </p>
          <EmptyState
              v-else-if="!messageLogEntries.length"
              embedded
              compact
              :title="t('queryResult.messagesEmpty')"
          >
            <template #icon>
              <DwIcon name="info" size="md" :stroke-width="1.5"/>
            </template>
          </EmptyState>
          <button
              v-for="entry in messageLogEntries"
              :key="entry.key"
              type="button"
              class="messages-entry"
              :class="{
                'is-active': currentView === entry.resultIndex,
                'is-error': entry.status === 'error',
              }"
              @click="selectResult(entry.resultIndex)"
          >
            <div class="messages-entry__head">
              <span v-if="formatOutputTimestamp(entry.executedAtMs)" class="messages-entry__time">
                [{{ formatOutputTimestamp(entry.executedAtMs) }}]
              </span>
              <span class="messages-entry__stmt">
                {{ t('queryResult.messageStatement', {n: entry.statementNo}) }}
              </span>
              <span
                  class="messages-entry__badge"
                  :class="entry.status === 'error' ? 'is-error' : 'is-ok'"
              >
                {{
                  entry.status === 'error'
                    ? t('queryResult.outputStatusFailed')
                    : t('queryResult.outputStatusOk')
                }}
              </span>
            </div>
            <pre class="messages-entry__sql">{{ entry.sql || '—' }}</pre>
            <pre
                v-if="entry.status === 'error' && entry.errorMessage"
                class="messages-entry__error"
            >{{ entry.errorMessage }}</pre>
            <p
                class="messages-entry__meta"
                :class="{ 'query-duration--slow': isSlowQueryDuration(entry.durationMs) }"
            >
              {{ formatOutputMeta(entry) }}
            </p>
          </button>
        </div>
      </div>

      <div v-else-if="running && !activeResult" class="messages-log">
        <p class="messages-running">
          <span class="messages-running__spinner" aria-hidden="true"/>
          {{
            runningElapsedMs != null && runningElapsedMs > 0
              ? t('queryResult.messagesRunningElapsed', {duration: formatDurationMs(runningElapsedMs)})
              : t('queryResult.messagesRunning')
          }}
        </p>
      </div>

      <template v-else>
      <div
          v-if="activeResult?.batchEntries && batchSummaryStats"
          ref="batchSummaryRef"
          class="overview batch-summary"
      >
      <p v-if="activeResult.batchRunning" class="batch-running">
        <span class="batch-running__spinner" aria-hidden="true"/>
        {{
          t('queryResult.batchSummaryRunning', {
            current: batchSummaryStats.count,
            total: batchSummaryStats.total,
          })
        }}
      </p>
      <p v-if="activeResult.status === 'error' && !activeResult.batchRunning" class="error-title">
        {{ t('queryResult.errorTitle') }}
      </p>
      <p
          v-if="activeResult.status === 'error' && !activeResult.batchRunning && activeResult.errorMessage"
          class="error-message"
      >
        {{ activeResult.errorMessage }}
      </p>
      <div
          v-if="activeResult.status === 'error' && !activeResult.batchRunning && activeResult.errorLine"
          class="error-actions"
      >
        <button
            type="button"
            class="error-jump"
            @click="jumpToErrorLine(activeResult.errorLine!)"
        >
          {{ t('queryResult.jumpToLine', {line: activeResult.errorLine}) }}
        </button>
      </div>
      <p v-if="batchSummaryStats.count > 0" class="overview-head">
        {{
          t('queryResult.overviewSummaryPrefix', {
            count: batchSummaryStats.count,
            rows: batchSummaryStats.totalRows,
          })
        }}
        <span
            class="query-duration"
            :class="{ 'query-duration--slow': isSlowQueryDuration(batchSummaryStats.totalDuration) }"
        >{{ batchSummaryStats.totalDuration }}ms</span>{{ t('queryResult.overviewDurationSuffix') }}
      </p>
      <p v-else-if="activeResult.batchRunning" class="overview-empty">
        {{ t('queryResult.batchSummaryWaiting') }}
      </p>
      <ul v-if="batchSummaryStats.count > 0" class="overview-list">
        <li v-for="(entry, index) in activeResult.batchEntries" :key="index">
          <div class="overview-item overview-item--static">
            <span
                class="overview-ok"
                :class="{ 'overview-err': entry.status === 'error' }"
                aria-hidden="true"
            >{{ entry.status === 'error' ? '✕' : '✓' }}</span>
            <span class="overview-meta">
              {{
                t('queryResult.overviewItemPrefix', {
                  label: entry.label,
                  rows: entry.total,
                })
              }}
              <span
                  class="query-duration"
                  :class="{ 'query-duration--slow': isSlowQueryDuration(entry.durationMs) }"
              >{{ entry.durationMs }}ms</span>
            </span>
            <span class="overview-sql">{{ entry.sql }}</span>
          </div>
          <pre v-if="entry.status === 'error' && entry.errorMessage" class="batch-entry-error">{{
              entry.errorMessage
            }}</pre>
        </li>
      </ul>
    </div>

    <div v-else-if="activeResult?.status === 'error'" class="error-pane">
      <div class="error-callout" role="alert">
        <div class="error-callout__icon" aria-hidden="true">
          <DwIcon name="alert-circle" size="md" :stroke-width="1.8"/>
        </div>
        <div class="error-callout__body">
          <p class="error-callout__title">{{ t('queryResult.errorTitle') }}</p>
          <pre class="error-callout__message">{{ activeResult.errorMessage }}</pre>
          <div v-if="(enableAiFix && activeResult.sql?.trim() && activeResult.errorMessage) || activeResult.errorLine" class="error-callout__actions">
            <button
                v-if="enableAiFix && activeResult.sql?.trim() && activeResult.errorMessage"
                type="button"
                class="error-ai-fix"
                :disabled="aiFixLoading"
                @click="onRequestAiFix"
            >
              <DwIcon name="ai" size="xs" :stroke-width="1.5"/>
              <span>{{ aiFixLoading ? t('queryResult.aiFixLoading') : t('queryResult.aiFix') }}</span>
            </button>
            <button
                v-if="activeResult.errorLine"
                type="button"
                class="error-jump"
                @click="jumpToErrorLine(activeResult.errorLine!)"
            >
              {{ t('queryResult.jumpToLine', {line: activeResult.errorLine}) }}
            </button>
          </div>
        </div>
      </div>
      <details v-if="activeResult.sql?.trim()" class="error-sql" open>
        <summary class="error-sql__summary">
          <DwIcon class="error-sql__chevron" name="chevron-down" size="sm" :stroke-width="2.25"/>
          <span>{{ t('queryResult.failedSql') }}</span>
        </summary>
        <pre class="error-sql__code">{{ activeResult.sql }}</pre>
      </details>
    </div>

    <div v-else-if="activeResult?.explainPlan?.length" class="explain-plan-pane">
      <QueryResultAiSummaryPanel
          :open="!!aiExplainOpen"
          :loading="!!aiExplainLoading"
          :text="aiExplainText ?? ''"
          :title="t('queryResult.aiExplainTitle')"
          :loading-label="t('queryResult.aiExplainLoading')"
          :copy-label="t('queryResult.aiSummaryCopy')"
          :copied-label="t('queryResult.aiSummaryCopiedShort')"
          :copied-toast="t('queryResult.aiExplainCopied')"
          @close="emit('close-ai-explain')"
      />
      <ExplainPlanTree
          :nodes="activeResult.explainPlan"
          :sql="activeResult.sql"
          :db-type="dbType"
          :explain-mode="activeResult.explainMode"
          :enable-ai-explain="canRequestAiExplain"
          :ai-explain-loading="aiExplainLoading"
          :enable-index-draft="canRequestIndexDraft"
          :enable-ai-index-suggest="canRequestIndexSuggest"
          :ai-index-suggest-loading="aiIndexSuggestLoading"
          @open-index-draft="(payload) => requestIndexDraft(undefined, payload?.table)"
          @request-ai-index-suggest="requestAiIndexSuggest()"
          @request-ai-explain="onRequestAiExplain"
      />
    </div>

    <div v-else-if="activeDiffView" class="result-diff-wrap">
      <div
          v-if="governanceDiffLimited"
          class="result-diff-wrap__banner"
      >
        <DwInlineAlert
            :message="(activeDiffPreview?.hiddenChangedCount ?? 0) > 0
              ? t('queryResult.diffPreviewHidden', {hidden: activeDiffPreview?.hiddenChangedCount ?? 0})
              : t('queryResult.diffPreviewLimited')"
        />
        <DwButton
            variant="secondary"
            size="sm"
            type="button"
            @click="entitlement.guardPack('pack.governance', 'gov.resultDiff')"
        >
          {{ t('queryResult.diffUnlockFull') }}
        </DwButton>
      </div>
      <QueryResultDiffPanel
          :diff="activeDiffView"
          @exit="exitDiffMode"
      />
    </div>

    <div v-else-if="showExecResultPane" class="exec-result-pane">
      <p class="exec-result-pane__title">{{ t('queryResult.execResultTitle') }}</p>
      <p class="exec-result-pane__rows">{{ t('queryResult.dmlAffectedRows', {count: activeResult?.total ?? 0}) }}</p>
      <p
          class="exec-result-pane__duration"
          :class="{ 'query-duration--slow': isSlowQueryDuration(activeResult?.durationMs ?? 0) }"
      >
        {{ t('queryResult.messageSuccess', {duration: activeResult?.durationMs ?? 0}) }}
      </p>
      <details v-if="activeResult?.sql?.trim()" class="exec-result-pane__sql" open>
        <summary class="exec-result-pane__sql-summary">
          <DwIcon class="exec-result-pane__chevron" name="chevron-down" size="sm" :stroke-width="2.25"/>
          <span>{{ t('queryResult.failedSql') }}</span>
        </summary>
        <pre class="exec-result-pane__code">{{ activeResult.sql }}</pre>
      </details>
    </div>

    <div v-else-if="activeResult" class="result-grid-pane">
      <QueryResultAiSummaryPanel
          :open="!!aiSummaryOpen"
          :loading="!!aiSummaryLoading"
          :text="aiSummaryText ?? ''"
          @close="emit('close-ai-summary')"
      />
      <QueryResultChartPanel
          v-if="resultView === 'chart' && canShowResultChart"
          v-model:view-mode="resultView"
          :columns="activeResult.columns"
          :rows="activeResult.rows"
          :title="activeResult.label"
      />
      <DataGrid
          v-else
          v-model:view-state="viewState"
          :columns="activeResult.columns"
          :rows="activeResult.rows"
          :total="activeResult.total"
          :where="activeResult.where"
          :order-by="activeResult.orderBy"
          :show-filter="showFilter"
          :export-base-name="exportBaseName"
          :export-table-name="exportTableName"
          :suggest-export-mask="exportSuggestMask"
          :editable="editable"
          :read-only-hint="readOnlyHint"
          :can-delete="canDelete"
          :can-update="canUpdate"
          :column-details="columnDetails"
          :pk-columns="pkColumns"
          :table-auto-increment="tableAutoIncrement"
          :on-submit-changes="onSubmitChanges"
          :show-dml-actions="canGenerateDml"
          :show-export="showExport"
          :show-ai-summary="canRequestAiSummary"
          :ai-summary-loading="!!aiSummaryLoading"
          :show-fake-data="canShowFakeData"
          :enable-row-document-view="enableRowDocumentView"
          :enable-sql-fill="enableSqlFill"
          :show-field-types="showFieldTypes"
          :show-field-comments="showFieldComments"
          external-view-options
          :wrap-cells="resultPaneSettings.settings.wrapCells"
          :layout-mode="resultPaneSettings.settings.resultLayout"
          :column-density="resultPaneSettings.settings.columnDensity"
          :numeric-align="resultPaneSettings.settings.numericAlign"
          :hide-null-columns="resultPaneSettings.settings.hideNullColumns"
          :type-coloring="resultPaneSettings.settings.typeColoring"
          full-toolbar
          :has-more="gridHasMore"
          :truncated-at-cap="gridTruncatedAtCap"
          :truncated-cap-rows="gridTruncatedCapRows"
          :can-raise-max-rows="canRaiseMaxRows"
          :loading="props.loading"
          :cursor-loading="gridCursorLoading"
          :cursor-trimmed-rows="gridCursorTrimmedRows"
          :production-perf-active="props.productionPerfActive"
          @exported="onExported"
          @refresh="onRefreshGrid"
          @load-more="onLoadMoreRows"
          @raise-max-rows="onRaiseMaxRows"
          @generate-dml="onGenerateDml"
          @request-ai-summary="onRequestAiSummary"
          @generate-fake-data="emit('generate-fake-data')"
          @insert-order-by="emit('insert-order-by', $event)"
          @insert-where="emit('insert-where', $event)"
          @insert-where-in="emit('insert-where-in', $event)"
          @rewrite-where="emit('rewrite-where', $event)"
          @rewrite-order-by="emit('rewrite-order-by', $event)"
          @update:wrap-cells="resultPaneSettings.patchSettings({ wrapCells: $event })"
          @update:layout-mode="resultPaneSettings.patchSettings({ resultLayout: $event })"
      >
        <template v-if="canShowFakeData || canShowResultChart" #toolbar-extra>
          <QueryResultViewToggle v-if="canShowResultChart" v-model="resultView"/>
          <button
              v-if="canShowFakeData"
              type="button"
              class="grid-label-btn"
              @click="emit('generate-fake-data')"
          >
            <DwIcon class="grid-glyph grid-glyph--optical" name="dices" fit :stroke-width="1.75"/>
            <span>{{ t('workspace.fakeData.toolbar') }}</span>
          </button>
        </template>
        <template v-if="canRequestAiSummary" #toolbar-tail>
          <button
              type="button"
              class="grid-label-btn"
              :disabled="!!aiSummaryLoading"
              @click="onRequestAiSummary"
          >
            <DwIcon class="grid-glyph grid-glyph--optical" name="bot" fit :stroke-width="1.75"/>
            <span>{{ aiSummaryLoading ? t('queryResult.aiSummaryLoading') : t('queryResult.aiSummary') }}</span>
          </button>
        </template>
      </DataGrid>
    </div>
      </template>
    </div>
  </div>

  <GenerateDmlDialog
      v-if="activeResult"
      v-model:open="generateDmlOpen"
      :columns="activeResult.columns"
      :rows="generateDmlRows"
      :scope="generateDmlScope"
      :default-table-name="generateDmlTableName"
      :pk-columns="pkColumns"
      :connection-id="dmlConnectionId"
      :connection-name="dmlConnectionName"
      :database="dmlDatabase"
  />

  <ContextMenuHost
      v-if="showTabBar"
      :visible="menuVisible"
      :items="menuItems"
      :x="menuPos.x"
      :y="menuPos.y"
      @select="onMenuSelect"
      @close="closeMenu"
  />
</template>

<style scoped>
.result-diff-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.result-diff-wrap__banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
  padding: var(--dw-space-6) var(--dw-space-8) 0;
}
.result-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--dw-bg-editor);
}

.result-pane__main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.messages-tab {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--dw-bg-editor);
}

.messages-tab__sub {
  flex-shrink: 0;
  padding: var(--dw-space-2) var(--dw-space-4);
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-bg-panel);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
}

.messages-log {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--dw-space-4);
}

.messages-empty,
.messages-running,
.result-main-empty {
  margin: 0;
  padding: var(--dw-space-6);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.messages-running {
  display: flex;
  align-items: center;
  gap: var(--dw-space-3);
}

.messages-running__spinner {
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  border: 2px solid color-mix(in srgb, var(--dw-link) 25%, transparent);
  border-top-color: var(--dw-link);
  border-radius: 50%;
  animation: batch-spin 0.8s linear infinite;
  flex-shrink: 0;
}

.result-main-empty {
  flex: 1;
  justify-content: center;
}

.messages-entry {
  display: block;
  width: 100%;
  margin: 0 0 var(--dw-space-4);
  padding: var(--dw-space-3) var(--dw-space-4);
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.messages-entry:hover {
  border-color: var(--dw-border);
  background: var(--dw-bg-panel);
}

.messages-entry.is-active {
  border-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border));
  box-shadow: inset 2px 0 0 var(--dw-primary);
}

.messages-entry__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-space-2);
  margin-bottom: var(--dw-space-2);
  font-size: var(--dw-text-xs);
  line-height: 1.35;
}

.messages-entry__time {
  color: var(--dw-text-muted);
  font-family: var(--dw-mono);
  font-variant-numeric: tabular-nums;
}

.messages-entry__stmt {
  color: var(--dw-text-secondary);
  font-weight: 600;
}

.messages-entry__badge {
  margin-left: auto;
  padding: 0 var(--dw-space-2);
  border-radius: var(--dw-radius-xs);
  font-size: var(--dw-text-2xs);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.messages-entry__badge.is-ok {
  background: color-mix(in srgb, var(--dw-success) 18%, transparent);
  color: var(--dw-success-fg);
}

.messages-entry__badge.is-error {
  background: var(--dw-danger-soft);
  color: var(--dw-danger-fg);
}

.messages-entry__sql {
  margin: 0 0 var(--dw-space-2);
  padding: var(--dw-space-2) var(--dw-space-3);
  border-radius: var(--dw-radius-xs);
  background: color-mix(in srgb, var(--dw-bg-muted) 70%, transparent);
  color: var(--dw-text);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-relaxed);
  white-space: pre-wrap;
  word-break: break-word;
}

.messages-entry__meta {
  margin: 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-variant-numeric: tabular-nums;
}

.messages-entry.is-error .messages-entry__meta {
  color: var(--dw-danger-fg);
}

.messages-entry__error {
  margin: 0 0 var(--dw-space-2);
  padding: var(--dw-space-2) var(--dw-space-3);
  border-radius: var(--dw-radius-xs);
  background: var(--dw-danger-soft);
  color: var(--dw-danger-fg);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-2xs);
  white-space: pre-wrap;
  word-break: break-word;
}

.result-tab-bar {
  padding: 0 var(--dw-space-2);
}

.result-compare-btn {
  margin-right: 4px;
}

.result-pane-settings {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
}

.result-pane-settings__trigger.is-open {
  background: color-mix(in srgb, var(--dw-bg-muted) 70%, transparent);
  border-color: color-mix(in srgb, var(--dw-border) 88%, var(--dw-text) 12%);
  color: var(--dw-text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-text) 6%, transparent);
}

.community-result-views__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  min-width: 180px;
  padding: 4px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-radius-md, 8px);
  background: var(--dw-bg-elevated, var(--dw-bg));
  box-shadow: var(--dw-shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12));
}

.community-result-views__item {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dw-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.community-result-views__item:hover {
  background: color-mix(in srgb, var(--dw-bg-muted) 80%, transparent);
}

.overview {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--dw-space-6) var(--dw-space-8);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-md);
}

.overview-head {
  margin: 0 0 var(--dw-space-5);
  color: var(--dw-text);
}

.query-duration--slow {
  color: var(--dw-danger);
  font-weight: 600;
}

.overview-empty {
  margin: 0;
  color: var(--dw-text-muted);
}

.result-grid-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.explain-plan-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.explain-plan-pane :deep(.explain-plan) {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.explain-plan-pane :deep(.result-ai-summary) {
  margin: var(--dw-space-4) var(--dw-space-6) 0;
}

.result-grid-pane :deep(.data-grid),
.result-grid-pane :deep(.data-grid__dw-shell) {
  flex: 1;
  min-height: 0;
}

.overview-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.overview-item {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  width: 100%;
  padding: var(--dw-pad-control);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-panel);
  text-align: left;
  color: inherit;
}

.overview-list li + li {
  margin-top: var(--dw-space-3);
}

.overview-item:hover {
  border-color: var(--dw-border);
  background: var(--dw-bg-hover);
}

.overview-item--static {
  cursor: default;
}

.overview-item--static:hover {
  border-color: var(--dw-border-light);
  background: var(--dw-bg-panel);
}

.batch-entry-error {
  margin: var(--dw-space-3) 0 0;
  padding: var(--dw-pad-control);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-danger) 8%, var(--dw-bg-panel));
  border: 1px solid color-mix(in srgb, var(--dw-danger) 25%, transparent);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-relaxed);
  color: var(--dw-text);
}

.batch-running {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  margin: 0 0 var(--dw-space-5);
  color: var(--dw-text);
  font-weight: 500;
}

.batch-running__spinner,
.dw-tab__status--running {
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  border: 2px solid color-mix(in srgb, var(--dw-link) 25%, transparent);
  border-top-color: var(--dw-link);
  border-radius: 50%;
  animation: batch-spin 0.8s linear infinite;
  flex-shrink: 0;
}

.dw-tab__status--running {
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
}

@keyframes batch-spin {
  to {
    transform: rotate(360deg);
  }
}

.overview-ok {
  flex-shrink: 0;
  color: var(--dw-success);
  font-weight: 700;
}

.overview-err {
  color: var(--dw-danger);
}

.batch-summary .error-title {
  margin: 0 0 var(--dw-space-4);
  font-weight: 600;
  color: var(--dw-danger);
}

.batch-summary .error-message {
  margin: 0 0 var(--dw-space-6);
  padding: var(--dw-pad-control-lg);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-danger) 8%, var(--dw-bg-panel));
  border: 1px solid color-mix(in srgb, var(--dw-danger) 25%, transparent);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-relaxed);
}

.batch-summary .error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-6);
}

.error-pane {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--dw-space-7) var(--dw-space-8) var(--dw-space-8);
  color: var(--dw-text);
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-6);
}

.exec-result-pane {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--dw-space-7) var(--dw-space-8) var(--dw-space-8);
  color: var(--dw-text);
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
}

.exec-result-pane__title {
  margin: 0;
  font-size: var(--dw-text-md);
  font-weight: 700;
}

.exec-result-pane__rows {
  margin: 0;
  font-size: var(--dw-text-lg);
  font-weight: 600;
  color: var(--dw-primary);
}

.exec-result-pane__duration {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.exec-result-pane__sql {
  margin-top: var(--dw-space-4);
}

.exec-result-pane__sql-summary {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  cursor: pointer;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
  user-select: none;
}

.exec-result-pane__chevron {
  flex-shrink: 0;
  color: var(--dw-text-secondary);
}

.exec-result-pane__code {
  margin: var(--dw-space-3) 0 0;
  padding: var(--dw-pad-tight);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-subtle);
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
  white-space: pre-wrap;
  word-break: break-word;
}

.error-callout {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-space-6);
  padding: var(--dw-space-7) var(--dw-space-7) var(--dw-space-6);
  border-radius: var(--dw-panel-radius);
  border: 1px solid color-mix(in srgb, var(--dw-danger) 28%, var(--dw-border-light));
  border-left: 3px solid var(--dw-danger);
  background: color-mix(in srgb, var(--dw-danger) 7%, var(--dw-bg-panel));
  box-shadow: 0 1px 0 color-mix(in srgb, var(--dw-danger) 10%, transparent);
}

.error-callout__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: var(--dw-btn-height);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-danger) 14%, transparent);
  color: var(--dw-danger);
}

.error-callout__body {
  flex: 1;
  min-width: 0;
}

.error-callout__title {
  margin: 0 0 var(--dw-space-3);
  font-size: var(--dw-text-md);
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--dw-danger);
}

.error-callout__message {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-loose);
  color: var(--dw-text);
}

.error-callout__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
  margin-top: var(--dw-space-6);
}

.error-ai-fix {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-3) var(--dw-space-6);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 24%, var(--dw-border));
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-primary-softer);
  color: var(--dw-text);
  cursor: pointer;
  font-size: var(--dw-text-sm);
  font-weight: 600;
  transition: var(--dw-transition-colors);
}

.error-ai-fix:hover:not(:disabled) {
  background: var(--dw-primary-soft);
  border-color: var(--dw-primary-ring);
  color: var(--dw-primary);
}

.error-ai-fix:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-jump {
  padding: var(--dw-space-3) var(--dw-space-5);
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-secondary);
  cursor: pointer;
  font-size: var(--dw-text-sm);
  transition: background var(--dw-duration-fast) var(--dw-ease), color var(--dw-duration-fast) var(--dw-ease);
}

.error-jump:hover {
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  color: var(--dw-text);
}

.error-sql {
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-bg-panel) 90%, var(--dw-bg));
  overflow: hidden;
}

.error-sql__summary {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-4) var(--dw-space-6);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.error-sql__summary::-webkit-details-marker {
  display: none;
}

.error-sql__chevron {
  flex-shrink: 0;
  color: var(--dw-text-secondary);
  transition: transform var(--dw-duration) var(--dw-ease);
}

.error-sql[open] .error-sql__chevron {
  transform: rotate(180deg);
}

.error-sql__code {
  margin: 0;
  padding: var(--dw-space-5) var(--dw-space-6) var(--dw-space-6);
  border-top: 1px solid var(--dw-border-light);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-loose);
  color: var(--dw-text-secondary);
}

.overview-meta {
  flex-shrink: 0;
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
}

.overview-sql {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}
</style>
