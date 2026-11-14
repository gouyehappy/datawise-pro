<script setup lang="ts">
import {computed, defineAsyncComponent, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {ContextMenuHost} from '@/core/context-menu'
import TabBar from '@/core/components/TabBar.vue'
import TabItem from '@/core/components/TabItem.vue'
import DataGrid from '@/core/components/DataGrid.vue'
import {flattenDataGridProps} from '@/core/data-grid/types/data-grid-prop-groups'
import QueryResultViewToggle from '@/features/workspace/components/QueryResultViewToggle.vue'
import QueryResultPaneActions from '@/features/workspace/components/QueryResultPaneActions.vue'
import QueryResultMessagesPanel from '@/features/workspace/components/QueryResultMessagesPanel.vue'
import type {QueryResultMessageEntry} from '@/features/workspace/components/QueryResultMessagesPanel.vue'
import QueryResultBatchSummary from '@/features/workspace/components/QueryResultBatchSummary.vue'
import QueryResultErrorPane from '@/features/workspace/components/QueryResultErrorPane.vue'
import QueryResultExecResultPane from '@/features/workspace/components/QueryResultExecResultPane.vue'
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

/** PERF-16: secondary result UIs stay off the first-result critical path (chart already async). */
const QueryResultChartPanel = defineAsyncComponent(
    () => import('@/features/workspace/components/QueryResultChartPanel.vue'),
)
const ExplainPlanTree = defineAsyncComponent(
    () => import('@/features/workspace/components/ExplainPlanTree.vue'),
)
const GenerateDmlDialog = defineAsyncComponent(
    () => import('@/features/workspace/components/GenerateDmlDialog.vue'),
)
const QueryResultDiffPanel = defineAsyncComponent(
    () => import('@/features/workspace/components/QueryResultDiffPanel.vue'),
)
const QueryResultAiSummaryPanel = defineAsyncComponent(
    () => import('@/features/workspace/components/QueryResultAiSummaryPanel.vue'),
)

const MESSAGES_TAB_ID = '__messages__'
const PENDING_RESULT_TAB_ID = '__pending_result__'
/** Console messages tab uses activeView = -1 (same bar as result sets). */
const MESSAGES_VIEW_INDEX = -1

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
      /** P2-2：结果区可直接把这份结果（SQL + 涉及表）交给 AI 工作台提问 */
      showAiAsk?: boolean
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
  'request-ai-ask': []
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
const tabBarRef = ref<InstanceType<typeof TabBar>>()
const batchSummaryRef = ref<{ $el?: HTMLElement } | null>(null)

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

const messageLogEntries = computed<QueryResultMessageEntry[]>(() => {
  let statementNo = 0
  // Build in chronological order first so statement numbers stay stable, then apply display sort.
  const chronological: QueryResultMessageEntry[] = []
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

/** 工具栏「对比上一结果」按钮：只在数字索引视图下可用 */
function onComparePreviousResult() {
    if (typeof currentView.value !== 'number') return
    compareWithPrevious(currentView.value)
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

function formatOutputMeta(entry: QueryResultMessageEntry): string {
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
        const node = batchSummaryRef.value?.$el
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

/** Four-group DataGrid bind (source/edit/chrome/view) → flat attrs for the host grid API. */
const activeDataGridFlatProps = computed(() => {
  const result = activeResult.value
  if (!result) {
    return flattenDataGridProps({
      source: {columns: [], rows: []},
    })
  }
  return flattenDataGridProps({
    source: {
      columns: result.columns,
      rows: result.rows,
      total: result.total,
      where: result.where,
      orderBy: result.orderBy,
      columnDetails: props.columnDetails,
      pkColumns: props.pkColumns,
      tableAutoIncrement: props.tableAutoIncrement,
      hasMore: gridHasMore.value,
      truncatedAtCap: gridTruncatedAtCap.value,
      truncatedCapRows: gridTruncatedCapRows.value,
      canRaiseMaxRows: canRaiseMaxRows.value,
      loading: props.loading,
      cursorLoading: gridCursorLoading.value,
      cursorTrimmedRows: gridCursorTrimmedRows.value,
      productionPerfActive: props.productionPerfActive,
    },
    edit: {
      editable: props.editable,
      readOnlyHint: props.readOnlyHint,
      canDelete: props.canDelete,
      canUpdate: props.canUpdate,
      showDmlActions: canGenerateDml.value,
      onSubmitChanges: props.onSubmitChanges,
    },
    chrome: {
      showFilter: props.showFilter,
      fullToolbar: true,
      exportBaseName: exportBaseName.value,
      exportTableName: exportTableName.value,
      suggestExportMask: props.exportSuggestMask,
      showExport: props.showExport,
      showAiSummary: canRequestAiSummary.value,
      aiSummaryLoading: !!props.aiSummaryLoading,
      showFakeData: canShowFakeData.value,
      enableRowDocumentView: props.enableRowDocumentView,
      enableSqlFill: props.enableSqlFill,
      externalViewOptions: true,
    },
    view: {
      showFieldTypes: showFieldTypes.value,
      showFieldComments: showFieldComments.value,
      wrapCells: resultPaneSettings.settings.wrapCells,
      layoutMode: resultPaneSettings.settings.resultLayout,
      columnDensity: resultPaneSettings.settings.columnDensity,
      numericAlign: resultPaneSettings.settings.numericAlign,
      hideNullColumns: resultPaneSettings.settings.hideNullColumns,
      typeColoring: resultPaneSettings.settings.typeColoring,
    },
  })
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
              <span class="dw-tab__icon dw-tab__icon--messages" aria-hidden="true">
                <DwIcon name="history" size="tab" :stroke-width="1.85"/>
              </span>
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
              <span
                  v-else-if="item.status === 'error'"
                  class="dw-tab__icon"
                  aria-hidden="true"
              >
                <DwIcon name="alert-circle" size="tab" :stroke-width="1.85"/>
              </span>
              <span v-else class="dw-tab__icon" aria-hidden="true">
                <DwIcon name="table" size="tab" :stroke-width="1.85"/>
              </span>
            </template>
          </TabItem>
        </template>
        <template #actions>
          <QueryResultPaneActions
              :can-compare="typeof currentView === 'number' && canCompareWithPrevious(currentView)"
              :active-result="activeResult ?? null"
              :show-grid-view-options="showGridViewOptions"
              :show-layout-view-option="showLayoutViewOption"
              :collapsible="collapsible"
              @compare="onComparePreviousResult"
              @collapse="emit('collapse')"
          />
        </template>
      </TabBar>

      <QueryResultMessagesPanel
          v-if="isMessagesView"
          :entries="messageLogEntries"
          :running="running"
          :running-elapsed-ms="runningElapsedMs"
          :active-result-index="typeof currentView === 'number' ? currentView : undefined"
          :is-slow-duration="isSlowQueryDuration"
          :format-timestamp="formatOutputTimestamp"
          :format-meta="formatOutputMeta"
          @select="selectResult"
      />

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
      <QueryResultBatchSummary
          v-if="activeResult?.batchEntries && batchSummaryStats"
          ref="batchSummaryRef"
          :entries="activeResult.batchEntries"
          :batch-running="!!activeResult.batchRunning"
          :status="activeResult.status"
          :error-message="activeResult.errorMessage"
          :error-line="activeResult.errorLine"
          :stats="batchSummaryStats"
          :is-slow-duration="isSlowQueryDuration"
          @jump-error-line="jumpToErrorLine"
      />

    <QueryResultErrorPane
        v-else-if="activeResult?.status === 'error'"
        :error-message="activeResult.errorMessage"
        :error-line="activeResult.errorLine"
        :sql="activeResult.sql"
        :enable-ai-fix="enableAiFix"
        :ai-fix-loading="!!aiFixLoading"
        @request-ai-fix="onRequestAiFix"
        @jump-error-line="jumpToErrorLine"
    />

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

    <QueryResultExecResultPane
        v-else-if="showExecResultPane"
        :total="activeResult?.total ?? 0"
        :duration-ms="activeResult?.durationMs ?? 0"
        :sql="activeResult?.sql"
        :is-slow-duration="isSlowQueryDuration"
    />

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
          v-bind="activeDataGridFlatProps"
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
        <template v-if="canRequestAiSummary || showAiAsk" #toolbar-tail>
          <button
              v-if="showAiAsk"
              type="button"
              class="grid-label-btn"
              @click="emit('request-ai-ask')"
          >
            <DwIcon class="grid-glyph grid-glyph--optical" name="bot" fit :stroke-width="1.75"/>
            <span>{{ t('queryResult.askAi') }}</span>
          </button>
          <button
              v-if="canRequestAiSummary"
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

<style scoped src="./styles/query-result-pane.css"></style>
