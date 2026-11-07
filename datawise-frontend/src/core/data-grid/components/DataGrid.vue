<script setup lang="ts">
/**
 * @deprecated Host-only product SQL-result grid (entitlement / masking / editing / ClauseBar /
 * plugins / mongo). Do **not** lift wholesale into `@datawise/data-grid`.
 *
 * New work: compose `DwDataGrid` / `DwDataGridTable` / hooks / `GridExportDialog` /
 * `GridCellDetailDialog` from `@datawise/data-grid` (host thin wrappers under this module).
 * Callers today: `QueryResultPane` (+ shim `@/core/components/DataGrid.vue`).
 */
import {computed, nextTick, onBeforeUnmount, ref, shallowRef, toRef, watch, watchEffect} from 'vue'
import {useGridVirtualWindow} from '../useGridVirtualWindow'
import {useGridColumnVirtualWindow} from '../useGridColumnVirtualWindow'
import {useGridColumnLayout} from '../useGridColumnLayout'
import {useGridSelection} from '../useGridSelection'
import {useGridKeyboard} from '../useGridKeyboard'
import {useGridClipboard} from '../useGridClipboard'
import {useSuppressSelectionPlugins} from '../useSuppressSelectionPlugins'
import {useGridRangeSelection} from '../useGridRangeSelection'
import type {GridCellCoord, GridColumnLayoutState} from '../types'
import {useI18n} from 'vue-i18n'
import IconButton from '@/core/components/IconButton.vue'
import DwDataGrid from './DwDataGrid.vue'
import DwDataGridTable from './DwDataGridTable.vue'
import GridColumnPanel from './GridColumnPanel.vue'
import {DwIcon} from '@/core/icons'
import GridCellDetailDialog from './GridCellDetailDialog.vue'
import GridRowFormView from './GridRowFormView.vue'
import GridDateTimePicker from './GridDateTimePicker.vue'
import {
  useGridPendingEdit,
  type GridDisplayRow,
  type GridPendingBatch,
} from '../edit/useGridPendingEdit'
import {useDataGridClauseBar} from '../composables/useDataGridClauseBar'
import {useDataGridHoverPreview} from '../composables/useDataGridHoverPreview'
import type {TableColumn, TableRow} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import {columnRowKey, readRowCell} from '@/core/utils/query-result-column'
import {
    filterAndSortDisplayRows as filterAndSortDisplayRowsWithColumns,
    readRawDisplayRowCell as readRawDisplayRowCellWithText,
} from '../services/grid-display-rows.service'
import {
    computeDisplayTotal,
    computePagedRowIds,
    computePagedRows,
    computeRowOffset,
    computeTotalPages,
    resolveFormViewCanNext,
    resolveFormViewCanPrev,
    resolveFormViewRow,
    resolveFormViewRowIndex,
    resolveFormViewRowNumber,
    resolveFormViewRowTotal,
    resolveNextFormViewTarget,
    toggleLayoutMode as toggleLayoutModeForGrid,
} from '../services/grid-pagination.service'
import {useDataGridExport} from '../composables/useDataGridExport'
import {useDataGridCellDetail} from '../composables/useDataGridCellDetail'
import {useDataGridEditable} from '../composables/useDataGridEditable'
import {
  formatCellFullValue,
  formatCellPreviewValue,
  isExpandableCellValue,
} from '@/core/utils/cell-value-format'
import {
  applyGridViewStateToRows,
  cellMatchesFilter,
  compareCellValues,
  suggestGridColumnWidth,
  toggleGridSort,
  resolveSortSpecs,
  type GridViewState,
} from '@/core/data-grid/services/grid-view-state.service'
import GridExportDialog from './GridExportDialog.vue'
import GridClauseBar from './GridClauseBar.vue'
import {compileWhereExpression, rowMatchesWhereExpression} from '@/core/data-grid/services/grid-where-expression.service'
import {ContextMenuHost} from '@/core/context-menu'
import {useContextMenuAnchor} from '@/core/context-menu'
import type {ContextMenuItem} from '@/core/types'
import {useDataGridHost} from '@/core/data-grid/data-grid-host'
import {
  columnDensityWidthScale,
} from '@/core/data-grid/services/query-result-pane-settings.service'
import {
  readGridCellValue,
} from '@/core/data-grid/services/grid-cell-context.service'
import {
  computeGridColumnStats,
  formatGridColumnStatsLines,
  type GridColumnStats,
} from '@/core/data-grid/services/grid-column-stats.service'
import {CONSOLE_GRID_PAGE_SIZE_OPTIONS} from '@/shared/config/editor-presets'
import {resolveGridPageSizeOption} from '@/shared/config/grid-pagination'
import {CURSOR_LOADED_ROWS_WARN_THRESHOLD} from '@/shared/config/query-result-limits'
import {readStoredEditorSettings} from '@/shared/config/editor-settings-storage'
import {
  isGridColumnPrimaryKey,
  isGridNumericColumn,
  isGridTemporalColumn,
  resolveGridColumnCommentLabel,
  resolveGridColumnTypeKind,
  resolveGridColumnTypeLabel,
  resolveGridTemporalKind,
  type GridTemporalKind,
} from '../meta/column-meta'
import {
  buildDocumentFromGridRow,
  formatMongoDocumentJson,
  resolveMongoDocumentRowLabel,
} from '@/core/data-grid/services/mongo-document-row.service'
import {
  resolveGridCellEditorKind,
  shouldUseDedicatedCellEditor,
} from '@/core/data-grid/services/grid-cell-editor.service'

const {t} = useI18n()
const gridHost = useDataGridHost()
const layout = {
    showWarningToast: (message: string) => gridHost.showWarningToast(message),
    showSuccessToast: (message: string) => gridHost.showSuccessToast(message),
}
const pluginStore = {isEnabled: (pluginId: string) => gridHost.isPluginEnabled(pluginId)}
const entitlement = gridHost.entitlement

const renderedGrid = computed(() =>
    gridHost.applyPluginRenderGrid(
        props.columns,
        props.rows,
        {
            connectionId: props.connectionId,
            database: props.database,
        },
        (pluginId) => pluginStore.isEnabled(pluginId),
    ),
)

const gridColumns = computed(() => renderedGrid.value.columns)
const gridRows = computed(() => renderedGrid.value.rows)

const props = withDefaults(
    defineProps<{
      columns: TableColumn[]
      rows: TableRow[]
      total?: number
      where?: string
      orderBy?: string
      showFilter?: boolean
      fullToolbar?: boolean
      exportBaseName?: string
      exportTableName?: string
      /** 鐢熶骇鐜绛夊満鏅缓璁粯璁ゅ紑鍚劚鏁忓鍑?*/
      suggestExportMask?: boolean
      editable?: boolean
      /** 只读原因（数据源不支持 DML 等）；非 editable 时在工具栏下展示 */
      readOnlyHint?: string
      canDelete?: boolean
      canUpdate?: boolean
      columnDetails?: TableColumnDetail[]
      pkColumns?: string[]
      tableAutoIncrement?: string | null
      onSubmitChanges?: (batch: GridPendingBatch) => Promise<boolean>
      hasMore?: boolean
      /** 棣栨鎷夊彇琛?鏌ヨ缁撴灉涓紙鏃犲垪鏃跺睍绀哄姞杞芥€侊級 */
      loading?: boolean
      cursorLoading?: boolean
      /** 婊戝姩绐楀彛涓㈠純鐨勬渶鏃╄鏁帮紝鐢ㄤ簬琛屽彿椤哄欢 */
      cursorTrimmedRows?: number
      /**
       * Result hit a hard row cap with no server cursor (e.g. federated JOIN).
       * Shows a truncation hint instead of Load more.
       */
      truncatedAtCap?: boolean
      /** Effective row cap when truncatedAtCap (pageSize / maxRows). */
      truncatedCapRows?: number
      /** Show raise-limit action when truncated at cap (federated / hard maxRows). */
      canRaiseMaxRows?: boolean
      /** 鐢熶骇鐜宸插惎鐢ㄨ緝浣庣殑杩斿洖琛屾暟涓婇檺 */
      productionPerfActive?: boolean
      showDmlActions?: boolean
      connectionId?: string
      database?: string
      showExport?: boolean
      /** 鍙抽敭鑿滃崟锛欰I 鎽樿锛堢敱鐖剁粍浠跺鐞嗭級 */
      showAiSummary?: boolean
      aiSummaryLoading?: boolean
      /** 鍙抽敭鑿滃崟锛氭祴璇曟暟鎹紙鐢辩埗缁勪欢澶勭悊锛?*/
      showFakeData?: boolean
      /** Mongo 绛夋枃妗ｆ簮锛氱偣鍑昏鍙锋墦寮€鏁磋 JSON 鏂囨。 */
      enableRowDocumentView?: boolean
      /** 控制台：Alt+点击 / 右键回填 SQL 到编辑器 */
      enableSqlFill?: boolean
      /** 表头显示字段类型 */
      showFieldTypes?: boolean
      /** 表头显示字段注释 */
      showFieldComments?: boolean
      /** 换行 / 表单布局由结果区「视图选项」控制，隐藏网格工具栏上的对应按钮 */
      externalViewOptions?: boolean
      wrapCells?: boolean
      layoutMode?: 'grid' | 'form'
      columnDensity?: 'compact' | 'standard' | 'relaxed'
      numericAlign?: 'left' | 'right'
      hideNullColumns?: boolean
      typeColoring?: boolean
    }>(),
    {
      total: 0,
      showFilter: false,
      fullToolbar: false,
      exportBaseName: 'query_result',
      editable: false,
      canDelete: false,
      canUpdate: false,
      columnDetails: () => [],
      pkColumns: () => [],
      showDmlActions: false,
      suggestExportMask: false,
      showExport: true,
      showAiSummary: false,
      aiSummaryLoading: false,
      showFakeData: false,
      enableRowDocumentView: false,
      enableSqlFill: false,
      truncatedAtCap: false,
      truncatedCapRows: undefined,
      canRaiseMaxRows: false,
      loading: false,
      showFieldTypes: true,
      showFieldComments: true,
      externalViewOptions: false,
      wrapCells: false,
      layoutMode: 'grid',
      columnDensity: 'standard',
      numericAlign: 'right',
      hideNullColumns: false,
      typeColoring: false,
    },
)

const showInitialLoading = computed(() => props.loading && !gridColumns.value.length)
const GRID_SKELETON_COLS = [72, 128, 96, 112, 88, 140] as const
const GRID_SKELETON_ROWS = 9

const pageSizeModel = ref(
    resolveGridPageSizeOption(
        CONSOLE_GRID_PAGE_SIZE_OPTIONS,
        readStoredEditorSettings().defaultGridPageSize,
    ),
)
const currentPage = ref(1)
const pageSizeOptions = CONSOLE_GRID_PAGE_SIZE_OPTIONS

const emit = defineEmits<{
  refresh: []
  exported: [fileName: string, path?: string]
  'load-more': []
  'raise-max-rows': []
  'generate-dml': [payload: {rows: TableRow[]; scope: 'selected' | 'filtered'}]
  'request-ai-summary': []
  'generate-fake-data': []
  /** 结果列头回填：ORDER BY */
  'insert-order-by': [payload: { column: string; direction: 'asc' | 'desc' }]
  /** 结果单元格回填：WHERE / AND 等值条件 */
  'insert-where': [payload: { column: string; value: unknown }]
  /** 本页唯一值 WHERE IN */
  'insert-where-in': [payload: { column: string; clause: string }]
  /** 写回原结果 SQL 的 WHERE */
  'rewrite-where': [payload: { column: string; value: unknown }]
  /** 写回原结果 SQL 的 ORDER BY */
  'rewrite-order-by': [payload: { column: string; direction: 'asc' | 'desc' }]
  'update:wrapCells': [value: boolean]
  'update:layoutMode': [value: 'grid' | 'form']
}>()

const localWrapCells = ref(false)
const localLayoutMode = ref<'grid' | 'form'>('grid')

const wrapCells = computed({
  get() {
    return props.externalViewOptions ? props.wrapCells : localWrapCells.value
  },
  set(value: boolean) {
    if (props.externalViewOptions) emit('update:wrapCells', value)
    else localWrapCells.value = value
  },
})

const layoutMode = computed({
  get(): 'grid' | 'form' {
    return props.externalViewOptions ? props.layoutMode : localLayoutMode.value
  },
  set(value: 'grid' | 'form') {
    if (props.externalViewOptions) emit('update:layoutMode', value)
    else localLayoutMode.value = value
  },
})

const viewState = defineModel<GridViewState>('viewState')

const columnFiltersEnabled = computed(() => viewState.value !== undefined)

/** Bridge GridViewState layout fields → generic column layout (or local when unbound). */
const columnLayout = computed<GridColumnLayoutState | undefined>({
  get() {
    if (!viewState.value) return undefined
    return {
      columnWidths: viewState.value.columnWidths,
      columnOrder: viewState.value.columnOrder,
      pinnedColumns: viewState.value.pinnedColumns ?? [],
      pinnedRightColumns: viewState.value.pinnedRightColumns ?? [],
      hiddenColumns: viewState.value.hiddenColumns ?? [],
    }
  },
  set(next) {
    if (!next || !viewState.value) return
    viewState.value = {
      ...viewState.value,
      columnWidths: next.columnWidths,
      columnOrder: next.columnOrder,
      pinnedColumns: next.pinnedColumns ?? [],
      pinnedRightColumns: next.pinnedRightColumns ?? [],
      hiddenColumns: next.hiddenColumns ?? [],
    }
  },
})

const {
  displayColumns: layoutDisplayColumns,
  tableMinWidthPx,
  columnWidthPx,
  columnColStyle: layoutColumnColStyle,
  dragFromKey,
  dragOverKey,
  resizingKey,
  onResizeStart,
  onResizeDoubleClick,
  onHeaderDragStart,
  onHeaderDragOver,
  onHeaderDrop,
  onHeaderDragEnd,
  consumeSuppressSortClick,
  togglePinned,
  setColumnHidden,
  autoSizeColumn,
  pinnedColumnKeys,
  pinnedRightColumnKeys,
  writeLayout,
} = useGridColumnLayout<TableColumn>({
  columns: () => gridColumns.value,
  columnKey: columnRowKey,
  layout: columnLayout,
  resolveDefaultWidth: (_key, column) => suggestGridColumnWidth(column, props.columnDetails),
})

function isNullishCellValue(value: unknown): boolean {
  return value == null || value === ''
}

const displayColumns = computed(() => {
  const columns = layoutDisplayColumns.value
  if (!props.hideNullColumns) return columns
  const rows = gridRows.value
  if (!rows.length) return columns
  return columns.filter((column) =>
      rows.some((row) => !isNullishCellValue(readGridCellValue(row, column))),
  )
})

function columnColStyle(columnKey: string): Record<string, string> {
  const style = layoutColumnColStyle(columnKey)
  const scale = columnDensityWidthScale(props.columnDensity)
  if (scale === 1) return style
  const next = {...style}
  for (const key of ['width', 'minWidth', 'left', 'right'] as const) {
    const raw = next[key]
    if (!raw?.endsWith('px')) continue
    const px = Number.parseFloat(raw)
    if (!Number.isFinite(px)) continue
    next[key] = `${Math.round(px * scale)}px`
  }
  return next
}

function scaledColumnWidthPx(columnKey: string): number {
  return Math.round(columnWidthPx(columnKey) * columnDensityWidthScale(props.columnDensity))
}

const scaledTableMinWidthPx = computed(() =>
    Math.round(tableMinWidthPx.value * columnDensityWidthScale(props.columnDensity)),
)

function isColumnPinned(columnKey: string): boolean {
  return pinnedColumnKeys.value.includes(columnKey)
}

function isColumnPinnedRight(columnKey: string): boolean {
  return pinnedRightColumnKeys.value.includes(columnKey)
}

const columnPanelOpen = ref(false)
const cellRange = useGridRangeSelection()

function patchViewLayout(next: GridViewState | ((state: GridViewState) => GridViewState)) {
  const base: GridViewState = viewState.value ?? {
    columnFilters: {},
    whereExpression: '',
    sortColumn: null,
    sortDirection: null,
    sortSpecs: [],
    columnWidths: {...(columnLayout.value?.columnWidths ?? {})},
    columnOrder: [...(columnLayout.value?.columnOrder ?? [])],
    pinnedColumns: [...(columnLayout.value?.pinnedColumns ?? [])],
    pinnedRightColumns: [...(columnLayout.value?.pinnedRightColumns ?? [])],
    hiddenColumns: [...(columnLayout.value?.hiddenColumns ?? [])],
  }
  const resolved = typeof next === 'function' ? next(base) : next
  if (viewState.value) {
    viewState.value = resolved
  }
}

const pinnedLeftRenderColumns = computed(() =>
    displayColumns.value.filter((column) => isColumnPinned(columnRowKey(column))),
)
const pinnedRightRenderColumns = computed(() =>
    displayColumns.value.filter((column) => isColumnPinnedRight(columnRowKey(column))),
)
const scrollableColumns = computed(() =>
    displayColumns.value.filter(
        (column) =>
            !isColumnPinned(columnRowKey(column))
            && !isColumnPinnedRight(columnRowKey(column)),
    ),
)


// 琛ㄦ暟鎹紪杈戯細鏈湴鏆傚瓨 + 鎵归噺淇濆瓨锛堣 useGridPendingEdit锛?
const pendingEdit = useGridPendingEdit({
  columns: () => gridColumns.value,
  rows: () => gridRows.value,
  columnDetails: () => props.columnDetails,
  editable: () => inlineEnabled.value,
  pkColumns: () => props.pkColumns,
  tableAutoIncrement: () => props.tableAutoIncrement,
  onSubmit: async (batch) => props.onSubmitChanges?.(batch) ?? false,
})

const {
  displayRows,
  hasPendingChanges,
  pendingCount,
  submitting,
  selectedRowId,
  editingCell,
  cellInputRef,
  selectRow,
  isRowSelected,
  isRowModified,
  isRowPendingDelete,
  getCellDisplayText,
  isCellEditing,
  startEditCell,
  stopEditCell,
  setCellValue,
  addInsertRow,
  markDeleteSelected,
  submitPending,
  discardPending,
} = pendingEdit

const pageSize = computed(() => {
  const parsed = Number(pageSizeModel.value)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return Number(
      resolveGridPageSizeOption(
          pageSizeOptions,
          readStoredEditorSettings().defaultGridPageSize,
      ),
  )
})

function readRawDisplayRowCell(item: GridDisplayRow, column: TableColumn): unknown {
  return readRawDisplayRowCellWithText(item, column, getCellDisplayText)
}

function filterAndSortDisplayRows(rows: GridDisplayRow[], state: GridViewState): GridDisplayRow[] {
  return filterAndSortDisplayRowsWithColumns(rows, gridColumns.value, state, getCellDisplayText)
}

/** Debounce text filters so each keystroke does not re-scan the full loaded set. */
const debouncedFilterView = shallowRef<{
  whereExpression: string
  columnFilters: Record<string, string>
} | null>(null)
let filterDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(
    () => {
      const state = viewState.value
      if (!state) return null
      return {
        whereExpression: state.whereExpression ?? '',
        columnFilters: state.columnFilters,
      }
    },
    (next) => {
      if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
      if (!next) {
        debouncedFilterView.value = null
        return
      }
      filterDebounceTimer = setTimeout(() => {
        debouncedFilterView.value = {
          whereExpression: next.whereExpression,
          columnFilters: {...next.columnFilters},
        }
        filterDebounceTimer = null
      }, 150)
    },
    {deep: true, immediate: true},
)

const viewFilteredDisplayRows = computed(() => {
  if (!columnFiltersEnabled.value || !viewState.value) return displayRows.value
  const filters = debouncedFilterView.value
  const stateForFilter: GridViewState = {
    ...viewState.value,
    whereExpression: filters?.whereExpression ?? viewState.value.whereExpression,
    columnFilters: filters?.columnFilters ?? viewState.value.columnFilters,
  }
  return filterAndSortDisplayRows(displayRows.value, stateForFilter)
})

const totalPages = computed(() =>
    computeTotalPages(viewFilteredDisplayRows.value.length, pageSize.value),
)

const displayTotal = computed(() =>
    computeDisplayTotal(viewFilteredDisplayRows.value.length),
)

const loadedRowsWarning = computed(() =>
    gridRows.value.length >= CURSOR_LOADED_ROWS_WARN_THRESHOLD,
)

const cursorWindowTrimmed = computed(() => (props.cursorTrimmedRows ?? 0) > 0)

const pagedRows = computed(() =>
    computePagedRows(viewFilteredDisplayRows.value, currentPage.value, pageSize.value),
)

const pagedRowIds = computed(() => computePagedRowIds(pagedRows.value))

const rowOffset = computed(() =>
    computeRowOffset(props.cursorTrimmedRows ?? 0, currentPage.value, pageSize.value),
)

const formViewRow = computed(() =>
    resolveFormViewRow(viewFilteredDisplayRows.value, selectedRowId.value),
)

/** 鍦ㄨ繃婊ゅ悗鐨勫叏閲忚涓殑涓嬫爣锛堣法椤碉級 */
const formViewRowIndex = computed(() =>
    resolveFormViewRowIndex(viewFilteredDisplayRows.value, formViewRow.value),
)

const formViewRowNumber = computed(() =>
    resolveFormViewRowNumber(formViewRowIndex.value, props.cursorTrimmedRows ?? 0),
)

const formViewRowTotal = computed(() =>
    resolveFormViewRowTotal(viewFilteredDisplayRows.value, props.cursorTrimmedRows ?? 0),
)

const formViewCanPrev = computed(() => resolveFormViewCanPrev(formViewRowIndex.value))
const formViewCanNext = computed(() =>
    resolveFormViewCanNext(formViewRowIndex.value, viewFilteredDisplayRows.value),
)

function selectFormViewRowByOffset(delta: number) {
  const rows = viewFilteredDisplayRows.value
  if (!rows.length) return
  const currentIndex = formViewRowIndex.value >= 0 ? formViewRowIndex.value : 0
  const target = resolveNextFormViewTarget(rows, currentIndex, delta, pageSize.value)
  if (!target.row) return
  if (currentPage.value !== target.page) {
    currentPage.value = target.page
  }
  selectRow(target.row)
}

function toggleLayoutMode() {
  layoutMode.value = toggleLayoutModeForGrid(layoutMode.value)
  if (layoutMode.value === 'form' && formViewRow.value) {
    selectRow(formViewRow.value)
  }
}

const gridRootRef = ref<HTMLElement | null>(null)
useSuppressSelectionPlugins(gridRootRef)

const gridBodyRef = ref<HTMLElement | null>(null)
const pagedRowsRef = toRef(pagedRows)
const virtualScrollEnabled = computed(() => !wrapCells.value)
const {
  useVirtual: useGridVirtual,
  visibleRows: virtualPagedRows,
  paddingTop: virtualPaddingTop,
  paddingBottom: virtualPaddingBottom,
  scrollToRowIndex,
} = useGridVirtualWindow(gridBodyRef, pagedRowsRef, {enabled: virtualScrollEnabled})

const scrollableColumnsRef = toRef(scrollableColumns)
const {
  visibleScrollableColumns,
  paddingLeftPx: columnPaddingLeftPx,
  paddingRightPx: columnPaddingRightPx,
} = useGridColumnVirtualWindow(gridBodyRef, scrollableColumnsRef, {
  columnWidthPx: (column) => scaledColumnWidthPx(columnRowKey(column)),
  enabled: virtualScrollEnabled,
})

const renderColumns = computed(() => [
  ...pinnedLeftRenderColumns.value,
  ...visibleScrollableColumns.value,
  ...pinnedRightRenderColumns.value,
])

const tableColumnCount = computed(() => {
  let count = renderColumns.value.length + 1
  if (columnPaddingLeftPx.value > 0) count += 1
  if (columnPaddingRightPx.value > 0) count += 1
  return count
})

const {
    exportDialogOpen,
    exportSubmitting,
    exportEnabled,
    maskExportEnabled,
    resolveExportRows,
    openExportDialog,
    onExportConfirm,
} = useDataGridExport({
    t,
    layout,
    pluginStore,
    entitlement,
    emit,
    props,
    displayColumns,
    gridRows,
    gridColumns,
    viewState,
    columnFiltersEnabled,
})

watch(
    () => props.rows,
    () => {
      currentPage.value = 1
    },
)

watch(pageSizeModel, () => {
  currentPage.value = 1
})

watch(currentPage, () => {
  // Synchronous reset ? scrollTo() can race the virt window against a stale offset.
  const el = gridBodyRef.value
  if (el) el.scrollTop = 0
})

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

watch(displayRows, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = totalPages.value
  }
})

watch(
    viewFilteredDisplayRows,
    () => {
      if (currentPage.value > totalPages.value) {
        currentPage.value = totalPages.value
      }
    },
)

watch(
    () => viewState.value,
    () => {
      currentPage.value = 1
    },
    {deep: true},
)

const showFilterBar = computed(() => props.showFilter && !!(props.where || props.orderBy))

/** Prefer Shift/Ctrl multi-select (or multi-row cell range); otherwise all filtered rows. */
function resolveDmlRows(): {rows: TableRow[]; scope: 'selected' | 'filtered'} {
  const selected = resolveSelectedTableRows()
  if (selected.length > 1) {
    return {rows: selected, scope: 'selected'}
  }
  const fromRange = resolveCellRangeTableRows()
  if (fromRange.length > 1) {
    return {rows: fromRange, scope: 'selected'}
  }
  return {rows: resolveExportRows(), scope: 'filtered'}
}

function resolveSelectedTableRows(): TableRow[] {
  const ids = rowSelection.selectedIds.value
  if (ids.size === 0) return []
  return tableRowsForDisplayIds([...ids])
}

function resolveCellRangeTableRows(): TableRow[] {
  const norm = cellRange.normalized(
      pagedRowIds.value,
      displayColumns.value.map((col) => col.name),
  )
  if (!norm?.rowIds.length) return []
  return tableRowsForDisplayIds(norm.rowIds)
}

function tableRowsForDisplayIds(ids: readonly string[]): TableRow[] {
  const idSet = new Set(ids)
  const rows: TableRow[] = []
  for (const item of viewFilteredDisplayRows.value) {
    if (!idSet.has(item.id) || item.kind === 'insert' || !item.originalRow) continue
    rows.push(item.originalRow)
  }
  return rows
}

function onGenerateDmlClick() {
  emit('generate-dml', resolveDmlRows())
}

function onHeaderSort(columnKey: string, multi = false) {
  if (!viewState.value) return
  if (consumeSuppressSortClick()) return
  viewState.value = toggleGridSort(viewState.value, columnKey, {multi})
}

function onHeaderClick(event: MouseEvent, column: TableColumn) {
  if (props.enableSqlFill && event.altKey) {
    event.preventDefault()
    event.stopPropagation()
    emit('insert-order-by', {column: column.name, direction: 'asc'})
    return
  }
  if (columnFiltersEnabled.value) {
    onHeaderSort(columnRowKey(column), event.ctrlKey || event.metaKey)
  }
}

function sortDirection(columnKey: string): 'asc' | 'desc' | null {
  if (!viewState.value) return null
  const spec = resolveSortSpecs(viewState.value).find((entry) => entry.column === columnKey)
  return spec?.direction ?? null
}

function onResizeDblClick(event: MouseEvent, column: TableColumn) {
  const samples = pagedRows.value.slice(0, 80).map((row) => getCellDisplayText(row, column.name))
  onResizeDoubleClick(event, column, samples, column.name)
}

function isCellInRange(item: GridDisplayRow, columnName: string): boolean {
  return cellRange.isCellInRange(
      item.id,
      columnName,
      pagedRowIds.value,
      displayColumns.value.map((col) => col.name),
  )
}

function columnTypeLabel(column: TableColumn): string {
  if (!props.showFieldTypes) return ''
  return resolveGridColumnTypeLabel(column, props.columnDetails)
}

function columnCommentLabel(column: TableColumn): string {
  if (!props.showFieldComments) return ''
  return resolveGridColumnCommentLabel(column, props.columnDetails)
}

const {
  filterColumnHints,
  whereClauseDraft,
  orderClauseDraft,
  whereClauseInvalid,
  orderClauseInvalid,
  applyClauseBar,
  onClauseBarFocusChange,
} = useDataGridClauseBar({
  viewState,
  displayColumns: () => displayColumns.value,
  columnTypeLabel,
})


function isPrimaryKeyColumn(column: TableColumn): boolean {
  return isGridColumnPrimaryKey(column, props.pkColumns, props.columnDetails)
}

function isNumericColumn(column: TableColumn): boolean {
  return isGridNumericColumn(column, props.columnDetails)
}

function columnTypeKind(column: TableColumn) {
  return resolveGridColumnTypeKind(column, props.columnDetails)
}

const {
    inlineEnabled,
    deleteEnabled,
    submitEnabled,
    discardEnabled,
    submitActionTitle,
    discardActionTitle,
    deleteActionTitle,
    columnsByName,
    onAddRowClick,
    bindEditingInput,
    isCellInputVisible,
    cellBackingText,
    canExpandCell,
    onDeleteRowClick,
    onSubmitClick,
    onDiscardClick,
    onCellInput,
    onCellKeydownEnter,
} = useDataGridEditable({
    t,
    props,
    gridColumns,
    displayRows,
    pagedRows,
    currentPage,
    totalPages,
    gridBodyRef,
    useGridVirtual,
    readRawDisplayRowCell,
    getCellDisplayText,
    isCellEditing,
    addInsertRow,
    markDeleteSelected,
    submitPending,
    discardPending,
    setCellValue,
    selectedRowId,
    hasPendingChanges,
    pendingCount,
    submitting,
    editingCell,
    cellInputRef,
    scrollToRowIndex,
    closeDateTimePicker,
    stopEditCell,
})

const {
  cellHoverPreview,
  cellHoverPreviewEl,
  hideCellHoverPreview,
  clearCellHoverPreviewShowTimer,
  onCellMouseEnter: onCellMouseEnterHover,
  onCellMouseLeave,
  onCellHoverPreviewEnter,
  onCellHoverPreviewLeave,
} = useDataGridHoverPreview({
  isCellInputVisible,
  readRawCell: (item, column) => readRawDisplayRowCell(item, column),
  canExpandCell: (item, column) => canExpandCell(item, column),
})

function onCellMouseEnterForGrid(
    event: MouseEvent,
    item: typeof displayRows.value[number],
    column: TableColumn,
) {
  if (cellRange.dragging.value) {
    cellRange.dragTo({rowId: item.id, columnKey: column.name})
  }
  onCellMouseEnterHover(event, item, column)
}

const CELL_DBLCLICK_MS = 400
let lastCellClick: {rowId: string; column: string; at: number} | null = null
let editStartedFromMouseDown = false
/** Ignore blur that races with programmatic focus after double-click edit. */
let editFocusLockUntil = 0

function beginInlineCellEdit(
    item: typeof displayRows.value[number],
    columnName: string,
    rowIndex: number,
) {
  hideCellHoverPreview()
  lastCellClick = null
  const column = gridColumns.value.find((col) => col.name === columnName)
  if (!column) return
  if (!inlineEnabled.value || item.pendingDelete) return
  if (!props.canUpdate) {
    layout.showWarningToast(t('dataGrid.updateNeedsPrimaryKey'))
    return
  }
  const editorKind = resolveGridCellEditorKind(column, props.columnDetails, readRawDisplayRowCell(item, column))
  if (editorKind === 'binary') {
    openCellDetail(item, column, rowIndex, {forceViewOnly: true})
    return
  }
  editFocusLockUntil = Date.now() + 120
  void startEditCell(item, columnName)
}

const {
    cellDetailOpen,
    cellDetail,
    openCellDetail,
    onFormViewOpenEditor,
    onCellDetailApply,
    openRowDocument,
    closeCellDetail,
} = useDataGridCellDetail({
    t,
    props,
    gridColumns,
    displayRows,
    rowOffset,
    inlineEnabled,
    readRawDisplayRowCell,
    setCellValue,
    formViewRow,
    formViewRowNumber,
})

function onCellDblClick(
    item: typeof displayRows.value[number],
    columnName: string,
    event: MouseEvent,
    rowIndex: number,
) {
  event.preventDefault()
  if (editStartedFromMouseDown) {
    editStartedFromMouseDown = false
    return
  }
  beginInlineCellEdit(item, columnName, rowIndex)
}

function toggleWrapCells() {
  wrapCells.value = !wrapCells.value
}

const activeCell = ref<{ rowId: string; column: string } | null>(null)
const datePickerTarget = ref<{rowId: string; column: string; kind: GridTemporalKind} | null>(null)
const datePickerStyle = ref<{top: string; left: string} | undefined>()
const datePickerKeepOpen = ref(false)

const datePickerValue = computed(() => {
  const target = datePickerTarget.value
  if (!target) return ''
  const item = displayRows.value.find((row) => row.id === target.rowId)
  if (!item) return ''
  return getCellDisplayText(item, target.column)
})

function updateDatePickerPlacement() {
  const input = cellInputRef.value
  if (!input) return
  const rect = input.getBoundingClientRect()
  const width = 268
  const left = Math.min(rect.left, window.innerWidth - width - 8)
  datePickerStyle.value = {
    top: `${Math.min(rect.bottom + 4, window.innerHeight - 320)}px`,
    left: `${Math.max(8, left)}px`,
  }
}

function openDateTimePicker(item: typeof displayRows.value[number], columnName: string) {
  const column = gridColumns.value.find((col) => col.name === columnName)
  if (!column) {
    datePickerTarget.value = null
    return
  }
  const kind = resolveGridTemporalKind(column, props.columnDetails)
  if (!kind) {
    datePickerTarget.value = null
    return
  }
  datePickerTarget.value = {rowId: item.id, column: columnName, kind}
  void nextTick(updateDatePickerPlacement)
}

function closeDateTimePicker() {
  datePickerTarget.value = null
  datePickerKeepOpen.value = false
}

function onDatePickerChange(value: string) {
  const target = datePickerTarget.value
  if (!target) return
  const item = displayRows.value.find((row) => row.id === target.rowId)
  if (!item) return
  setCellValue(item, target.column, value)
}

function onDatePickerPointerDown() {
  datePickerKeepOpen.value = true
}

function isTemporalColumn(column: TableColumn): boolean {
  return isGridTemporalColumn(column, props.columnDetails)
}

function showDateTimeIcon(item: typeof displayRows.value[number], column: TableColumn): boolean {
  return inlineEnabled.value && props.canUpdate && !item.pendingDelete
      && isTemporalColumn(column)
      && (
        item.kind === 'insert'
        || isCellActive(item, column.name)
        || isCellInputVisible(item, column.name)
      )
}

async function onDateTimeIconClick(item: typeof displayRows.value[number], columnName: string) {
  datePickerKeepOpen.value = true
  const openSame = datePickerTarget.value?.rowId === item.id
      && datePickerTarget.value?.column === columnName
  if (openSame) {
    closeDateTimePicker()
    return
  }
  if (!editingCell.value || editingCell.value.rowId !== item.id || editingCell.value.column !== columnName) {
    await startEditCell(item, columnName)
  }
  await nextTick()
  openDateTimePicker(item, columnName)
}

watch(selectedRowId, (rowId) => {
  if (!rowId) activeCell.value = null
})

watch(hasPendingChanges, (pending) => {
  if (!pending) activeCell.value = null
})

watch(editingCell, (cell) => {
  if (!cell) closeDateTimePicker()
  else hideCellHoverPreview()
})

watch(gridBodyRef, (el, _prev, onCleanup) => {
  if (!el) return
  const onScroll = () => hideCellHoverPreview()
  el.addEventListener('scroll', onScroll, {passive: true})
  onCleanup(() => el.removeEventListener('scroll', onScroll))
}, {immediate: true})

onBeforeUnmount(() => {
  if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
  hideCellHoverPreview()
})

function onIndexColClick(item: typeof displayRows.value[number], rowIndex: number, event?: MouseEvent) {
  if (event?.shiftKey || event?.ctrlKey || event?.metaKey) {
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
  }
  if (props.enableRowDocumentView && item.kind === 'existing' && !event?.ctrlKey && !event?.shiftKey) {
    openRowDocument(item, rowIndex)
    return
  }
  rowSelection.onRowClick(item.id, pagedRowIds.value, event ?? {})
  const primary = pagedRows.value.find((row) => row.id === rowSelection.primaryId.value)
  if (primary && (inlineEnabled.value || event?.ctrlKey || event?.shiftKey)) {
    selectRow(primary)
  }
  activeCell.value = null
}

function onCellMouseDown(
    event: MouseEvent,
    item: typeof displayRows.value[number],
    columnName: string,
    rowIndex: number,
) {
  if (event.button !== 0 || event.altKey) return
  const now = Date.now()
  const isDouble = Boolean(
      lastCellClick
      && lastCellClick.rowId === item.id
      && lastCellClick.column === columnName
      && now - lastCellClick.at <= CELL_DBLCLICK_MS,
  )
  if (isDouble) {
    event.preventDefault()
    editStartedFromMouseDown = true
    cellRange.clearRange()
    beginInlineCellEdit(item, columnName, rowIndex)
    return
  }
  lastCellClick = {rowId: item.id, column: columnName, at: now}
  // Shift/Ctrl：阻止浏览器原生划词选区（暗色主题下会出现发白的矩形框）
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
  }
  if (event.shiftKey && activeCell.value) {
    cellRange.setRange(
        {rowId: activeCell.value.rowId, columnKey: activeCell.value.column},
        {rowId: item.id, columnKey: columnName},
    )
  } else if (!event.ctrlKey && !event.metaKey) {
    cellRange.beginDrag({rowId: item.id, columnKey: columnName})
  }
}

function onCellMouseUp() {
  cellRange.endDrag()
}

function onCellClick(
    event: MouseEvent,
    item: typeof displayRows.value[number],
    columnName: string,
) {
  if (editStartedFromMouseDown) {
    editStartedFromMouseDown = false
    return
  }
  if (props.enableSqlFill && event.altKey) {
    event.preventDefault()
    event.stopPropagation()
    const value = item.originalRow
        ? readGridCellValue(item.originalRow, displayColumns.value.find((c) => c.name === columnName) ?? {name: columnName})
        : null
    emit('insert-where', {column: columnName, value})
    return
  }
  clearCellHoverPreviewShowTimer()
  activeCell.value = {rowId: item.id, column: columnName}
  rowSelection.onRowClick(item.id, pagedRowIds.value, event)
  if (!inlineEnabled.value && !event.ctrlKey && !event.shiftKey) return
  const primary = pagedRows.value.find((row) => row.id === rowSelection.primaryId.value)
  if (primary) selectRow(primary)
}

function onCellInputFocus(item: typeof displayRows.value[number], columnName: string) {
  if (item.kind === 'insert') {
    selectRow(item)
    activeCell.value = {rowId: item.id, column: columnName}
    editingCell.value = {rowId: item.id, column: columnName}
  }
}

function onCellInputBlur(item: typeof displayRows.value[number]) {
  window.setTimeout(() => {
    if (Date.now() < editFocusLockUntil) {
      cellInputRef.value?.focus({preventScroll: true})
      return
    }
    if (datePickerKeepOpen.value) {
      datePickerKeepOpen.value = false
      cellInputRef.value?.focus()
      return
    }
    closeDateTimePicker()
    if (item.kind !== 'insert') stopEditCell()
  }, 0)
}

function isCellActive(item: typeof displayRows.value[number], columnName: string) {
  const cell = activeCell.value
  return cell?.rowId === item.id && cell.column === columnName
}

/** AG-aligned multi-select; primary stays synced with pending-edit selectedRowId. */
const rowSelection = useGridSelection({externalPrimaryId: selectedRowId})

const focusCell = computed<GridCellCoord | null>({
  get: () =>
      activeCell.value
          ? {rowId: activeCell.value.rowId, columnKey: activeCell.value.column}
          : null,
  set: (next) => {
    activeCell.value = next ? {rowId: next.rowId, column: next.columnKey} : null
  },
})

const gridClipboard = useGridClipboard({
  getCopyMatrix: () => {
    const rowIds = pagedRowIds.value
    const colNames = displayColumns.value.map((col) => col.name)
    const rangeNorm = cellRange.normalized(rowIds, colNames)
    if (rangeNorm) {
      return rangeNorm.rowIds.map((rowId) => {
        const item = pagedRows.value.find((row) => row.id === rowId)
        return rangeNorm.columnKeys.map((col) => (item ? getCellDisplayText(item, col) : ''))
      })
    }
    const cols = displayColumns.value
    const ids = rowSelection.selectedIds.value.size
        ? [...rowSelection.selectedIds.value]
        : (selectedRowId.value ? [selectedRowId.value] : [])
    const rows = ids.length
        ? pagedRows.value.filter((row) => ids.includes(row.id))
        : (activeCell.value
            ? pagedRows.value.filter((row) => row.id === activeCell.value!.rowId)
            : [])
    if (!rows.length || !cols.length) return []
    if (activeCell.value && ids.length <= 1) {
      const item = rows[0]
      if (!item) return []
      return [[getCellDisplayText(item, activeCell.value.column)]]
    }
    return rows.map((row) => cols.map((col) => getCellDisplayText(row, col.name)))
  },
  applyPasteMatrix: (matrix) => {
    if (!inlineEnabled.value || !props.canUpdate) return
    const start = activeCell.value
    if (!start) return
    const rowIds = pagedRowIds.value
    const colNames = displayColumns.value.map((col) => col.name)
    const startRow = rowIds.indexOf(start.rowId)
    const startCol = colNames.indexOf(start.column)
    if (startRow < 0 || startCol < 0) return
    for (let r = 0; r < matrix.length; r++) {
      const rowId = rowIds[startRow + r]
      const item = pagedRows.value.find((row) => row.id === rowId)
      if (!item || item.pendingDelete) continue
      const line = matrix[r] ?? []
      for (let c = 0; c < line.length; c++) {
        const colName = colNames[startCol + c]
        if (!colName) continue
        setCellValue(item, colName, line[c] ?? '')
      }
    }
  },
})

const {onKeyDown: onGridKeyDown} = useGridKeyboard({
  focusCell,
  rowIds: () => pagedRowIds.value,
  columnKeys: () => displayColumns.value.map((col) => col.name),
  suppressNavigation: () => Boolean(editingCell.value),
  pageSize: () => {
    const body = gridBodyRef.value
    if (!body) return 10
    return Math.max(1, Math.floor(body.clientHeight / 30) - 1)
  },
  handlers: {
    moveFocus: (next) => {
      focusCell.value = next
      const item = pagedRows.value.find((row) => row.id === next.rowId)
      if (item) {
        rowSelection.selectOnly(item.id)
        selectRow(item)
      }
      const idx = pagedRows.value.findIndex((row) => row.id === next.rowId)
      if (idx >= 0) scrollToRowIndex(idx)
      return true
    },
    beginEdit: (cell) => {
      const item = pagedRows.value.find((row) => row.id === cell.rowId)
      if (!item) return
      const rowIndex = pagedRows.value.findIndex((row) => row.id === cell.rowId)
      beginInlineCellEdit(item, cell.columnKey, Math.max(0, rowIndex))
    },
    stopEdit: () => {
      closeDateTimePicker()
      stopEditCell()
    },
    isEditing: () => Boolean(editingCell.value),
    copy: () => {
      void gridClipboard.copySelection()
    },
    paste: () => {
      void gridClipboard.pasteAtFocus()
    },
    extendRange: (next) => {
      const start = cellRange.range.value?.start
          ?? (activeCell.value
              ? {rowId: activeCell.value.rowId, columnKey: activeCell.value.column}
              : next)
      cellRange.setRange(start, next)
    },
    clearRange: () => cellRange.clearRange(),
  },
})

function isRowMultiSelected(item: GridDisplayRow): boolean {
  return rowSelection.isSelected(item.id)
}

function isDatePickerOpen(item: GridDisplayRow, columnName: string): boolean {
  return datePickerTarget.value?.rowId === item.id && datePickerTarget.value?.column === columnName
}

const {
  visible: cellMenuVisible,
  pos: cellMenuPos,
  target: cellMenuTarget,
  open: openCellMenu,
  close: closeCellMenu,
} = useContextMenuAnchor<{ item: GridDisplayRow; column: TableColumn }>()

const cellMenuItems = computed<ContextMenuItem[]>(() => {
  const items: ContextMenuItem[] = [
    {id: 'copy-cell', label: t('dataGrid.contextMenu.copyCell'), icon: 'copy'},
    {id: 'copy-row', label: t('dataGrid.contextMenu.copyRow'), icon: 'copy'},
  ]

  // 与工具栏一致：按 editable 显示，不依赖 columnDetails 是否已加载
  if (props.editable) {
    items.push(
        {id: 'divider-edit', label: '', divider: true},
    )
    if (props.canUpdate) {
      items.push({id: 'fill-down', label: t('dataGrid.contextMenu.fillDown')})
    }
    items.push(
        {id: 'add-row', label: t('dataGrid.addRow'), icon: 'plus'},
        {
          id: 'delete-row',
          label: t('dataGrid.deleteRow'),
          icon: 'minus',
          disabled: !deleteEnabled.value,
          danger: true,
        },
    )
  }

  const hasDataActions =
      (exportEnabled.value && props.showExport && displayColumns.value.length > 0)
      || props.showDmlActions
  if (hasDataActions) {
    items.push({id: 'divider-data', label: '', divider: true})
    if (props.showDmlActions) {
      items.push({id: 'generate-dml', label: t('dataGrid.generateDml'), icon: 'ddl'})
    }
    if (exportEnabled.value && props.showExport && displayColumns.value.length > 0) {
      items.push({id: 'export', label: t('dataGrid.export'), icon: 'export'})
    }
  }

  if (props.showFakeData || props.showAiSummary) {
    items.push({id: 'divider-extra', label: '', divider: true})
    if (props.showFakeData) {
      items.push({id: 'fake-data', label: t('workspace.fakeData.toolbar'), icon: 'dices'})
    }
    if (props.showAiSummary) {
      items.push({
        id: 'ai-summary',
        label: props.aiSummaryLoading
            ? t('queryResult.aiSummaryLoading')
            : t('queryResult.aiSummary'),
        icon: 'bot',
        disabled: props.aiSummaryLoading,
      })
    }
  }

  return items
})

function onCellContextMenu(event: MouseEvent, item: GridDisplayRow, column: TableColumn) {
  event.preventDefault()
  if (props.editable) {
    selectRow(item)
    activeCell.value = {rowId: item.id, column: column.name}
  }
  openCellMenu(event, {item, column})
}

async function copyGridContextText(
    text: string,
    toastKey: 'copied' | 'statsCopied',
) {
  if (!text.trim()) return
  await navigator.clipboard.writeText(text)
  layout.showSuccessToast(t(`dataGrid.contextMenu.${toastKey}`))
}

async function onCellMenuSelect(id: string) {
  const target = cellMenuTarget.value
  closeCellMenu()
  if (!target) return
  const {item, column} = target
  const cellValue = item.originalRow ? readGridCellValue(item.originalRow, column) : null

  if (id === 'fill-down') {
    if (!props.canUpdate) return
    const startIdx = pagedRows.value.findIndex((row) => row.id === item.id)
    if (startIdx < 0) return
    // Draft 约定：null 展示为空串，与 setCellValue / formatCellDraft 一致
    const text = getCellDisplayText(item, column.name)
    for (let i = startIdx + 1; i < pagedRows.value.length; i++) {
      const row = pagedRows.value[i]
      if (!row || row.pendingDelete) continue
      setCellValue(row, column.name, text)
    }
    return
  }
  if (id === 'copy-cell') {
    await copyGridContextText(formatCellFullValue(cellValue), 'copied')
    return
  }
  if (id === 'copy-row') {
    const text = displayColumns.value
        .map((col) => getCellDisplayText(item, col.name))
        .join('\t')
    await copyGridContextText(text, 'copied')
    return
  }
  if (id === 'add-row') {
    await onAddRowClick()
    return
  }
  if (id === 'delete-row') {
    onDeleteRowClick()
    return
  }
  if (id === 'generate-dml') {
    onGenerateDmlClick()
    return
  }
  if (id === 'export') {
    openExportDialog()
    return
  }
  if (id === 'fake-data') {
    emit('generate-fake-data')
    return
  }
  if (id === 'ai-summary') {
    emit('request-ai-summary')
  }
}

const {
  visible: headerMenuVisible,
  pos: headerMenuPos,
  target: headerMenuTarget,
  open: openHeaderMenu,
  close: closeHeaderMenu,
} = useContextMenuAnchor<TableColumn>()

const statsColumnName = ref<string | null>(null)

const headerMenuItems = computed<ContextMenuItem[]>(() => {
  const column = headerMenuTarget.value
  const columnKey = column ? columnRowKey(column) : ''
  const pinned = columnKey ? isColumnPinned(columnKey) : false
  const pinnedRight = columnKey ? isColumnPinnedRight(columnKey) : false
  const items: ContextMenuItem[] = [
    {id: 'toggle-column-stats', label: t('dataGrid.contextMenu.toggleColumnStats')},
    {id: 'copy-column-stats', label: t('dataGrid.contextMenu.copyColumnStats')},
    {id: 'divider-layout', label: '', divider: true},
    {id: 'auto-size-column', label: t('dataGrid.contextMenu.autoSizeColumn')},
    {
      id: 'toggle-pin-column',
      label: pinned
          ? t('dataGrid.contextMenu.unpinColumn')
          : t('dataGrid.contextMenu.pinColumn'),
    },
    {
      id: 'toggle-pin-column-right',
      label: pinnedRight
          ? t('dataGrid.contextMenu.unpinColumn')
          : t('dataGrid.contextMenu.pinColumnRight'),
    },
    {id: 'hide-column', label: t('dataGrid.contextMenu.hideColumn')},
    {id: 'manage-columns', label: t('dataGrid.contextMenu.manageColumns')},
  ]
  if (props.enableSqlFill) {
    items.push(
        {id: 'divider-sql-fill', label: '', divider: true},
        {id: 'insert-order-by', label: t('dataGrid.contextMenu.insertOrderBy')},
        {id: 'insert-order-by-desc', label: t('dataGrid.contextMenu.insertOrderByDesc')},
        {id: 'rewrite-order-by', label: t('dataGrid.contextMenu.rewriteOrderBy')},
        {id: 'rewrite-order-by-desc', label: t('dataGrid.contextMenu.rewriteOrderByDesc')},
    )
  }
  return items
})

function resolveStatsRows(): TableRow[] {
  return viewFilteredDisplayRows.value
      .filter((row) => row.kind !== 'insert' && row.originalRow)
      .map((row) => row.originalRow!)
}

const activeColumnStats = computed<GridColumnStats | null>(() => {
  const name = statsColumnName.value
  if (!name) return null
  const column = gridColumns.value.find((entry) => entry.name === name)
  if (!column) return null
  return computeGridColumnStats(column, resolveStatsRows())
})

function onHeaderContextMenu(event: MouseEvent, column: TableColumn) {
  event.preventDefault()
  openHeaderMenu(event, column)
}

async function onHeaderMenuSelect(id: string) {
  const column = headerMenuTarget.value
  closeHeaderMenu()
  if (!column) return

  if (id === 'toggle-column-stats') {
    statsColumnName.value = statsColumnName.value === column.name ? null : column.name
    return
  }

  if (id === 'auto-size-column') {
    const samples = pagedRows.value.slice(0, 80).map((row) => getCellDisplayText(row, column.name))
    autoSizeColumn(columnRowKey(column), samples, {headerText: column.name})
    return
  }
  if (id === 'toggle-pin-column') {
    togglePinned(columnRowKey(column), 'left')
    return
  }
  if (id === 'toggle-pin-column-right') {
    togglePinned(columnRowKey(column), 'right')
    return
  }
  if (id === 'hide-column') {
    setColumnHidden(columnRowKey(column), true)
    return
  }
  if (id === 'manage-columns') {
    columnPanelOpen.value = true
    return
  }

  if (id === 'copy-column-stats') {
    const stats = computeGridColumnStats(column, resolveStatsRows())
    await copyGridContextText(formatGridColumnStatsLines(stats).join('\n'), 'statsCopied')
    return
  }
  if (id === 'insert-order-by') {
    emit('insert-order-by', {column: column.name, direction: 'asc'})
    return
  }
  if (id === 'insert-order-by-desc') {
    emit('insert-order-by', {column: column.name, direction: 'desc'})
    return
  }
  if (id === 'rewrite-order-by') {
    emit('rewrite-order-by', {column: column.name, direction: 'asc'})
    return
  }
  if (id === 'rewrite-order-by-desc') {
    emit('rewrite-order-by', {column: column.name, direction: 'desc'})
  }
}

function dismissColumnStats() {
  statsColumnName.value = null
}
</script>

<template>
  <div
      ref="gridRootRef"
      class="data-grid"
      :class="{
        'is-wrap-cells': wrapCells,
        [`is-density-${columnDensity}`]: true,
        'is-numeric-align-left': numericAlign === 'left',
        'is-type-coloring': typeColoring,
      }"
      tabindex="0"
      data-dw-grid="1"
      data-testid="query-result-grid"
      @keydown="onGridKeyDown"
  >
    <DwDataGrid
        shell-only
        v-model:current-page="currentPage"
        v-model:page-size="pageSizeModel"
        :rows="[]"
        :columns="[]"
        :selectable="false"
        :show-search="false"
        :show-pagination="fullToolbar"
        :total-count="Number(displayTotal)"
        :page-size-options="pageSizeOptions"
        :labels="{ total: t('dataGrid.total', { count: displayTotal }) }"
        class="data-grid__dw-shell"
    >
      <template #toolbar-actions>
        <template v-if="!fullToolbar">
          <span class="page-indicator page-indicator--solo">{{ currentPage }}</span>
          <span class="pager-total">{{ t('dataGrid.total', {count: displayTotal}) }}</span>
        </template>
        <IconButton
            v-if="!externalViewOptions"
            class="grid-action-neutral"
            :active="wrapCells"
            :title="wrapCells ? t('dataGrid.unwrapCells') : t('dataGrid.wrapCells')"
            @click="toggleWrapCells"
        >
          <DwIcon class="grid-glyph" name="format" fit :stroke-width="1.75"/>
        </IconButton>
        <IconButton
            v-if="!externalViewOptions && fullToolbar && viewFilteredDisplayRows.length"
            class="grid-action-neutral"
            :active="layoutMode === 'form'"
            :title="layoutMode === 'form' ? t('dataGrid.formView.showGrid') : t('dataGrid.formView.showForm')"
            @click="toggleLayoutMode"
        >
          <DwIcon class="grid-glyph" name="table" fit :stroke-width="1.75"/>
        </IconButton>
        <template v-if="fullToolbar">
          <IconButton
              class="grid-action-neutral"
              :title="t('dataGrid.refresh')"
              :disabled="loading"
              @click="emit('refresh')"
          >
            <DwIcon class="grid-glyph" name="refresh" fit :stroke-width="1.75"/>
          </IconButton>
        </template>
      </template>

      <template v-if="fullToolbar" #toolbar-end>
        <span v-if="loadedRowsWarning" class="loaded-rows-hint">
          {{ t('dataGrid.loadedRowsWarning', {count: gridRows.length}) }}
        </span>
        <span v-if="cursorWindowTrimmed" class="loaded-rows-hint">
          {{ t('dataGrid.cursorWindowTrimmed', {count: cursorTrimmedRows ?? 0}) }}
        </span>
        <span v-if="productionPerfActive" class="loaded-rows-hint">
          {{ t('dataGrid.productionPerfActive') }}
        </span>
        <span v-if="truncatedAtCap" class="loaded-rows-hint loaded-rows-hint--warn" role="status">
          {{
            truncatedCapRows
              ? t('dataGrid.truncatedAtCapWithLimit', {count: gridRows.length, limit: truncatedCapRows})
              : t('dataGrid.truncatedAtCap', {count: gridRows.length})
          }}
        </span>
        <div v-if="editable" class="grid-toolbar-group" role="group" :aria-label="t('dataGrid.editGroup')">
          <IconButton
              class="grid-action-save"
              :title="submitActionTitle"
              :disabled="!submitEnabled"
              @click="onSubmitClick"
          >
            <DwIcon class="grid-glyph" name="submit" fit :stroke-width="3.2"/>
          </IconButton>
          <IconButton
              class="grid-action-cancel"
              :title="discardActionTitle"
              :disabled="!discardEnabled"
              @click="onDiscardClick"
          >
            <DwIcon class="grid-glyph" name="rollback" fit :stroke-width="3.2"/>
          </IconButton>
          <IconButton class="grid-action-neutral" :title="t('dataGrid.addRow')" @click="onAddRowClick">
            <DwIcon class="grid-glyph" name="plus" fit :stroke-width="3.2"/>
          </IconButton>
          <IconButton
              class="grid-action-neutral"
              :title="deleteActionTitle"
              :disabled="!deleteEnabled"
              @click="onDeleteRowClick"
          >
            <DwIcon class="grid-glyph" name="minus" fit :stroke-width="3.2"/>
          </IconButton>
          <span
              v-if="inlineEnabled"
              class="grid-hint-tip"
              :title="t('dataGrid.editHint')"
              :aria-label="t('dataGrid.editHint')"
          >
            <DwIcon class="grid-glyph" name="help" fit :stroke-width="1.5"/>
          </span>
        </div>
        <span
            v-if="readOnlyHint && !editable"
            class="grid-hint-tip"
            :title="readOnlyHint"
            :aria-label="readOnlyHint"
        >
          <DwIcon class="grid-glyph" name="help" fit :stroke-width="1.5"/>
        </span>
        <div
            v-if="showDmlActions || $slots['toolbar-extra'] || (exportEnabled && showExport) || $slots['toolbar-tail']"
            class="grid-toolbar-group"
            role="group"
            :aria-label="t('dataGrid.toolsGroup')"
        >
          <slot name="toolbar-extra"/>
          <button
              v-if="showDmlActions"
              type="button"
              class="grid-label-btn"
              :title="t('dataGrid.generateDmlSelectedHint')"
              @click="onGenerateDmlClick"
          >
            <DwIcon class="grid-glyph" name="ddl" fit :stroke-width="1.75"/>
            <span>{{ t('dataGrid.generateDml') }}</span>
          </button>
          <button
              v-if="exportEnabled && showExport"
              type="button"
              class="grid-label-btn"
              @click="openExportDialog"
          >
            <DwIcon class="grid-glyph" name="export" fit :stroke-width="1.75"/>
            <span>{{ t('dataGrid.export') }}</span>
          </button>
          <slot name="toolbar-tail"/>
        </div>
        <div
            v-if="(hasMore && !truncatedAtCap) || (truncatedAtCap && canRaiseMaxRows)"
            class="grid-toolbar-group"
            role="group"
            :aria-label="t('dataGrid.loadGroup')"
        >
          <button
              v-if="truncatedAtCap && canRaiseMaxRows"
              type="button"
              class="grid-label-btn"
              @click="emit('raise-max-rows')"
          >
            <DwIcon class="grid-glyph" name="arrow-up-down" fit :stroke-width="1.5"/>
            <span>{{ t('dataGrid.raiseMaxRows') }}</span>
          </button>
          <button
              v-if="hasMore && !truncatedAtCap"
              type="button"
              class="grid-label-btn"
              :disabled="cursorLoading"
              @click="emit('load-more')"
          >
            <DwIcon
                class="grid-glyph"
                :class="{ 'grid-glyph--spin': cursorLoading }"
                :name="cursorLoading ? 'refresh' : 'chevrons-down'"
                fit
                :stroke-width="1.5"
            />
            <span>{{ cursorLoading ? t('dataGrid.loadingMore') : t('dataGrid.loadMore') }}</span>
          </button>
        </div>
      </template>

      <template #below-toolbar>
        <GridClauseBar
            v-if="columnFiltersEnabled"
            v-model:where="whereClauseDraft"
            v-model:order="orderClauseDraft"
            :columns="filterColumnHints"
            :where-invalid="whereClauseInvalid"
            :order-invalid="orderClauseInvalid"
            @apply="applyClauseBar()"
            @focus-change="onClauseBarFocusChange"
        />
        <div v-else-if="showFilterBar" class="filter-bar">
          <div class="filter-left">
            <DwIcon class="filter-icon" name="filter" size="xs" :stroke-width="1.6"/>
            <span class="keyword">WHERE</span>
            <span v-if="where" class="expr">{{ where }}</span>
          </div>
          <div class="filter-right">
            <span class="keyword">ORDER BY</span>
            <DwIcon class="sort-icon" name="arrow-up-down" size="xs" :stroke-width="1.4"/>
            <span v-if="orderBy" class="expr">{{ orderBy }}</span>
          </div>
        </div>
      </template>

      <template #body>
        <div v-if="activeColumnStats" class="grid-column-stats">
          <div class="grid-column-stats__head">
            <span class="grid-column-stats__title">
              {{ t('dataGrid.columnStatsTitle', {column: activeColumnStats.columnName}) }}
            </span>
            <span class="grid-column-stats__scope">{{ t('dataGrid.columnStatsScope') }}</span>
            <button class="grid-column-stats__close" type="button" @click="dismissColumnStats">
              {{ t('common.close') }}
            </button>
          </div>
          <div class="grid-column-stats__body">
            <span class="grid-column-stats__pill">
              {{ t('dataGrid.columnStatsRows', {count: activeColumnStats.rowCount}) }}
            </span>
            <span class="grid-column-stats__pill">
              {{ t('dataGrid.columnStatsNulls', {count: activeColumnStats.nullCount}) }}
            </span>
            <span class="grid-column-stats__pill">
              {{ t('dataGrid.columnStatsDistinct', {count: activeColumnStats.distinctCount}) }}
            </span>
            <span
                v-if="activeColumnStats.numericMin !== undefined && activeColumnStats.numericMax !== undefined"
                class="grid-column-stats__pill"
            >
              {{ t('dataGrid.columnStatsRange', {
                min: activeColumnStats.numericMin,
                max: activeColumnStats.numericMax,
              }) }}
            </span>
            <span v-if="activeColumnStats.numericAvg !== undefined" class="grid-column-stats__pill">
              {{ t('dataGrid.columnStatsAvg', {value: activeColumnStats.numericAvg.toFixed(2)}) }}
            </span>
            <span
                v-for="item in activeColumnStats.topValues"
                :key="`${item.value}:${item.count}`"
                class="grid-column-stats__pill grid-column-stats__pill--muted"
            >
              {{ item.value }} 脳 {{ item.count }}
            </span>
          </div>
        </div>

        <div
            v-if="showInitialLoading"
            class="grid-body-state"
            role="status"
            aria-live="polite"
            :aria-label="t('dataGrid.loadingTitle')"
        >
          <div class="grid-skeleton" aria-hidden="true">
            <div class="grid-skeleton__head">
              <span class="grid-skeleton__cell grid-skeleton__cell--index"/>
              <span
                  v-for="(width, colIndex) in GRID_SKELETON_COLS"
                  :key="`h-${colIndex}`"
                  class="grid-skeleton__cell grid-skeleton__cell--head"
                  :style="{width: `${width}px`}"
              />
            </div>
            <div
                v-for="rowIndex in GRID_SKELETON_ROWS"
                :key="`r-${rowIndex}`"
                class="grid-skeleton__row"
                :style="{'--sk-delay': `${(rowIndex - 1) * 45}ms`}"
            >
              <span class="grid-skeleton__cell grid-skeleton__cell--index"/>
              <span
                  v-for="(width, colIndex) in GRID_SKELETON_COLS"
                  :key="`c-${rowIndex}-${colIndex}`"
                  class="grid-skeleton__cell"
                  :style="{
                    width: `${Math.max(48, width - ((rowIndex + colIndex) % 3) * 14)}px`,
                  }"
              />
            </div>
          </div>
          <div class="grid-skeleton__status">
            <span class="grid-skeleton__spinner" aria-hidden="true"/>
            <div class="grid-skeleton__copy">
              <strong>{{ t('dataGrid.loadingTitle') }}</strong>
              <span>{{ t('dataGrid.loadingHint') }}</span>
            </div>
          </div>
        </div>
        <div
            v-else
            ref="gridBodyRef"
            class="grid-body"
            :class="{ 'grid-body--form': layoutMode === 'form' }"
        >
      <GridRowFormView
          v-if="layoutMode === 'form'"
          :columns="displayColumns"
          :column-details="columnDetails"
          :pk-columns="pkColumns"
          :row="formViewRow"
          :row-number="formViewRowNumber"
          :row-total="formViewRowTotal"
          :can-prev="formViewCanPrev"
          :can-next="formViewCanNext"
          :editable="inlineEnabled"
          :can-update="canUpdate"
          :get-cell-text="(columnName) => formViewRow ? getCellDisplayText(formViewRow, columnName) : ''"
          :read-cell-value="(column) => formViewRow ? readRawDisplayRowCell(formViewRow, column) : null"
          @select-prev="selectFormViewRowByOffset(-1)"
          @select-next="selectFormViewRowByOffset(1)"
          @field-change="(columnName, value) => formViewRow && setCellValue(formViewRow, columnName, value)"
          @open-editor="onFormViewOpenEditor"
      />
      <DwDataGridTable
          v-else
          :display-columns="renderColumns"
          :pinned-left-count="pinnedLeftRenderColumns.length"
          :pinned-right-count="pinnedRightRenderColumns.length"
          :column-padding-left-px="columnPaddingLeftPx"
          :column-padding-right-px="columnPaddingRightPx"
          :virtual-rows="virtualPagedRows"
          :use-virtual="useGridVirtual"
          :virtual-padding-top="virtualPaddingTop"
          :virtual-padding-bottom="virtualPaddingBottom"
          :table-column-count="tableColumnCount"
          :table-min-width-px="scaledTableMinWidthPx"
          :row-offset="rowOffset"
          :resizing-key="resizingKey"
          :drag-from-key="dragFromKey"
          :drag-over-key="dragOverKey"
          :column-filters-enabled="columnFiltersEnabled"
          :sort-column="viewState?.sortColumn ?? null"
          :stats-column-name="statsColumnName"
          :inline-enabled="inlineEnabled"
          :enable-row-document-view="enableRowDocumentView"
          :index-col-selectable-title="t('dataGrid.documentView.openHint')"
          :date-time-picker-title="t('dataGrid.dateTimePicker.title')"
          :null-value-label="t('common.nullValue')"
          :column-col-style="columnColStyle"
          :is-primary-key-column="isPrimaryKeyColumn"
          :is-numeric-column="isNumericColumn"
          :column-type-kind="columnTypeKind"
          :type-coloring="typeColoring"
          :column-type-label="columnTypeLabel"
          :column-comment-label="columnCommentLabel"
          :sort-direction="sortDirection"
          :is-row-selected="isRowSelected"
          :is-row-multi-selected="isRowMultiSelected"
          :is-row-modified="isRowModified"
          :is-row-pending-delete="isRowPendingDelete"
          :is-cell-active="isCellActive"
          :is-cell-input-visible="isCellInputVisible"
          :show-date-time-icon="showDateTimeIcon"
          :is-date-picker-open="isDatePickerOpen"
          :get-cell-display-text="getCellDisplayText"
          :cell-backing-text="cellBackingText"
          :bind-editing-input="bindEditingInput"
          :is-column-pinned="isColumnPinned"
          :is-column-pinned-right="isColumnPinnedRight"
          :is-cell-in-range="isCellInRange"
          :wrap-cells="wrapCells"
          @header-click="onHeaderClick"
          @header-context-menu="onHeaderContextMenu"
          @header-drag-start="onHeaderDragStart"
          @header-drag-over="onHeaderDragOver"
          @header-drop="onHeaderDrop"
          @header-drag-end="onHeaderDragEnd"
          @resize-start="onResizeStart"
          @resize-dbl-click="onResizeDblClick"
          @index-col-click="onIndexColClick"
          @cell-mouse-down="onCellMouseDown"
          @cell-mouse-up="onCellMouseUp"
          @cell-click="onCellClick"
          @cell-dbl-click="onCellDblClick"
          @cell-mouse-enter="onCellMouseEnterForGrid"
          @cell-mouse-leave="onCellMouseLeave"
          @cell-context-menu="onCellContextMenu"
          @cell-input="onCellInput"
          @cell-keydown-enter="onCellKeydownEnter"
          @cell-input-blur="onCellInputBlur"
          @cell-input-focus="onCellInputFocus"
          @date-time-icon-click="onDateTimeIconClick"
      />
        </div>
      </template>
    </DwDataGrid>

    <GridCellDetailDialog
        :open="cellDetailOpen"
        :column-name="cellDetail?.columnName ?? ''"
        :row-label="cellDetail?.rowLabel ?? ''"
        :content="cellDetail?.content ?? ''"
        :title="cellDetail?.title"
        :editable="cellDetail?.editable"
        :editor-kind="cellDetail?.editorKind"
        @close="closeCellDetail"
        @apply="onCellDetailApply"
    />

    <Teleport to="body">
      <div
          v-if="cellHoverPreview"
          ref="cellHoverPreviewEl"
          class="cell-hover-preview"
          :class="[
            `is-${cellHoverPreview.placement}`,
            { 'is-scrollable': cellHoverPreview.scrollable },
          ]"
          :style="cellHoverPreview.style"
          role="tooltip"
          @mouseenter="onCellHoverPreviewEnter"
          @mouseleave="onCellHoverPreviewLeave"
          @mousedown.stop
          @click.stop
          @wheel.stop
      >
        <div class="cell-hover-preview__head">
          <span class="cell-hover-preview__title">{{ cellHoverPreview.column }}</span>
        </div>
        <pre class="cell-hover-preview__body">{{ cellHoverPreview.content }}</pre>
      </div>
    </Teleport>

    <GridDateTimePicker
        :open="datePickerTarget != null"
        :kind="datePickerTarget?.kind ?? 'datetime'"
        :value="datePickerValue"
        :anchor-style="datePickerStyle"
        @change="onDatePickerChange"
        @close="closeDateTimePicker"
        @interact="onDatePickerPointerDown"
    />

    <ContextMenuHost
        :visible="cellMenuVisible"
        :x="cellMenuPos.x"
        :y="cellMenuPos.y"
        :items="cellMenuItems"
        @select="onCellMenuSelect"
        @close="closeCellMenu"
    />

    <ContextMenuHost
        :visible="headerMenuVisible"
        :x="headerMenuPos.x"
        :y="headerMenuPos.y"
        :items="headerMenuItems"
        @select="onHeaderMenuSelect"
        @close="closeHeaderMenu"
    />

    <GridColumnPanel
        :open="columnPanelOpen"
        :columns="gridColumns"
        :hidden-columns="columnLayout?.hiddenColumns ?? []"
        :pinned-columns="columnLayout?.pinnedColumns ?? []"
        :pinned-right-columns="columnLayout?.pinnedRightColumns ?? []"
        @close="columnPanelOpen = false"
        @toggle-hidden="(key, hidden) => setColumnHidden(key, hidden)"
        @toggle-pin-left="(key) => togglePinned(key, 'left')"
        @toggle-pin-right="(key) => togglePinned(key, 'right')"
        @show-all="writeLayout((state) => ({...state, hiddenColumns: []}))"
    />
    <GridExportDialog
        v-model:open="exportDialogOpen"
        :columns="displayColumns"
        :suggest-mask="suggestExportMask"
        :mask-export-enabled="maskExportEnabled"
        :exporting="exportSubmitting"
        :truncated-at-cap="truncatedAtCap"
        @export="onExportConfirm"
    />
  </div>
</template>

<style scoped src="./styles/data-grid-facade.css"></style>
