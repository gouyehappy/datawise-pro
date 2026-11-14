<script setup lang="ts">
/**
 * @deprecated Host-only product SQL-result grid (entitlement / masking / editing / ClauseBar /
 * plugins / mongo). Do **not** lift wholesale into `@datawise/data-grid`.
 *
 * New work: compose `DwDataGrid` / `DwDataGridTable` / hooks / `GridExportDialog` /
 * `GridCellDetailDialog` from `@datawise/data-grid` (host thin wrappers under this module).
 * Callers today: `QueryResultPane` (+ shim `@/core/components/DataGrid.vue`).
 */
import {computed, onBeforeUnmount, ref, toRef, watch, watchEffect} from 'vue'
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
import DwDataGrid from './DwDataGrid.vue'
import GridColumnPanel from './GridColumnPanel.vue'
import GridColumnStatsPanel from './GridColumnStatsPanel.vue'
import {DwIcon} from '@/core/icons'
import GridCellDetailDialog from './GridCellDetailDialog.vue'
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
import {readRawDisplayRowCell as readRawDisplayRowCellWithText} from '../services/grid-display-rows.service'
import {useDataGridPaging} from '../composables/useDataGridPaging'
import {useDataGridDateTimePicker} from '../composables/useDataGridDateTimePicker'
import {useDataGridExport} from '../composables/useDataGridExport'
import {useDataGridCellDetail} from '../composables/useDataGridCellDetail'
import {useDataGridEditable} from '../composables/useDataGridEditable'
import {useDataGridCellContextMenu} from '../composables/useDataGridCellContextMenu'
import {useDataGridHeaderContextMenu} from '../composables/useDataGridHeaderContextMenu'
import {
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
import DataGridToolbarActions from './DataGridToolbarActions.vue'
import DataGridToolbarEnd from './DataGridToolbarEnd.vue'
import DataGridLoadingSkeleton from './DataGridLoadingSkeleton.vue'
import DataGridFilterStrip from './DataGridFilterStrip.vue'
import DataGridMainViews from './DataGridMainViews.vue'
import {compileWhereExpression, rowMatchesWhereExpression} from '@/core/data-grid/services/grid-where-expression.service'
import {ContextMenuHost} from '@/core/context-menu'
import {useContextMenuAnchor} from '@/core/context-menu'
import {useDataGridHost} from '@/core/data-grid/data-grid-host'
import {
  columnDensityWidthScale,
} from '@/core/data-grid/services/query-result-pane-settings.service'
import {
  readGridCellValue,
} from '@/core/data-grid/services/grid-cell-context.service'
import {CONSOLE_GRID_PAGE_SIZE_OPTIONS} from '@/shared/config/editor-presets'
import {resolveGridPageSizeOption} from '@/shared/config/grid-pagination'
import {CURSOR_LOADED_ROWS_WARN_THRESHOLD} from '@/shared/config/query-result-limits'
import {readStoredEditorSettings} from '@/shared/config/editor-settings-storage'
import {
  isGridColumnPrimaryKey,
  isGridNumericColumn,
  resolveGridColumnCommentLabel,
  resolveGridColumnTypeKind,
  resolveGridColumnTypeLabel,
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
      /** 生产环境等场景建议默认开启敏感导出脱敏 */
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
      /** 首次拉取行/查询结果中（无列时展示加载态） */
      loading?: boolean
      cursorLoading?: boolean
      /** 滑动窗口丢弃的最旧行数，用于行号顺延 */
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
      /** 生产环境已启用较低的返回行数上限 */
      productionPerfActive?: boolean
      showDmlActions?: boolean
      connectionId?: string
      database?: string
      showExport?: boolean
      /** 右键菜单：AI 摘要（由父组件处理） */
      showAiSummary?: boolean
      aiSummaryLoading?: boolean
      /** 右键菜单：测试数据（由父组件处理） */
      showFakeData?: boolean
      /** Mongo 等文档源：点击行号打开整行 JSON 文档 */
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


// 表数据编辑：本地暂存 + 批量保存（见 useGridPendingEdit）
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

const {
  datePickerTarget,
  datePickerStyle,
  datePickerKeepOpen,
  datePickerValue,
  closeDateTimePicker,
  onDatePickerChange,
  onDatePickerPointerDown,
  showDateTimeIcon,
  onDateTimeIconClick,
} = useDataGridDateTimePicker({
  displayRows,
  gridColumns,
  getCellDisplayText,
  setCellValue,
  editingCell,
  startEditCell,
  cellInputRef,
  columnDetails: () => props.columnDetails,
  canUpdate: () => props.canUpdate,
  // 下列依赖由 useDataGridEditable 产出，晚于本 composable 构造，故惰性取值
  inlineEnabled: () => inlineEnabled.value,
  isCellInputVisible: (item, columnName) => isCellInputVisible(item, columnName),
  isCellActive: (item, columnName) => isCellActive(item, columnName),
})



function readRawDisplayRowCell(item: GridDisplayRow, column: TableColumn): unknown {
  return readRawDisplayRowCellWithText(item, column, getCellDisplayText)
}

const {
  pageSize,
  viewFilteredDisplayRows,
  totalPages,
  displayTotal,
  loadedRowsWarning,
  cursorWindowTrimmed,
  pagedRows,
  pagedRowIds,
  rowOffset,
  formViewRow,
  formViewRowIndex,
  formViewRowNumber,
  formViewRowTotal,
  formViewCanPrev,
  formViewCanNext,
  selectFormViewRowByOffset,
  toggleLayoutMode,
} = useDataGridPaging({
  pageSizeModel,
  pageSizeOptions,
  viewState,
  columnFiltersEnabled,
  displayRows,
  gridColumns,
  currentPage,
  layoutMode,
  selectedRowId,
  getCellDisplayText,
  loadedRowCount: () => gridRows.value.length,
  cursorTrimmedRows: () => props.cursorTrimmedRows ?? 0,
  selectRow,
})

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

watch(selectedRowId, (rowId) => {
  if (!rowId) activeCell.value = null
})

watch(hasPendingChanges, (pending) => {
  if (!pending) activeCell.value = null
})

// 日期选择器关闭由 useDataGridDateTimePicker 自行监听 editingCell
watch(editingCell, (cell) => {
  if (cell) hideCellHoverPreview()
})

watch(gridBodyRef, (el, _prev, onCleanup) => {
  if (!el) return
  const onScroll = () => hideCellHoverPreview()
  el.addEventListener('scroll', onScroll, {passive: true})
  onCleanup(() => el.removeEventListener('scroll', onScroll))
}, {immediate: true})

onBeforeUnmount(() => {
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

const {
  cellMenuItems,
  onCellContextMenu,
  copyContextText: copyGridContextText,
  onCellMenuSelect,
} = useDataGridCellContextMenu({
  t,
  flags: () => ({
    editable: props.editable,
    canUpdate: props.canUpdate,
    showExport: props.showExport,
    showDmlActions: props.showDmlActions,
    showFakeData: props.showFakeData,
    showAiSummary: props.showAiSummary,
    aiSummaryLoading: props.aiSummaryLoading,
  }),
  target: cellMenuTarget,
  openMenu: openCellMenu,
  closeMenu: closeCellMenu,
  activeCell,
  deleteEnabled,
  exportEnabled,
  displayColumns,
  pagedRows,
  getCellDisplayText,
  setCellValue,
  selectRow,
  showSuccessToast: layout.showSuccessToast,
  onAddRowClick,
  onDeleteRowClick,
  onGenerateDmlClick,
  openExportDialog,
  emitGenerateFakeData: () => emit('generate-fake-data'),
  emitRequestAiSummary: () => emit('request-ai-summary'),
})

const {
  visible: headerMenuVisible,
  pos: headerMenuPos,
  target: headerMenuTarget,
  open: openHeaderMenu,
  close: closeHeaderMenu,
} = useContextMenuAnchor<TableColumn>()

const {
  statsColumnName,
  headerMenuItems,
  activeColumnStats,
  onHeaderContextMenu,
  onHeaderMenuSelect,
  dismissColumnStats,
} = useDataGridHeaderContextMenu({
  t,
  enableSqlFill: () => props.enableSqlFill,
  target: headerMenuTarget,
  openMenu: openHeaderMenu,
  closeMenu: closeHeaderMenu,
  gridColumns,
  viewFilteredDisplayRows,
  pagedRows,
  columnKey: columnRowKey,
  isColumnPinned,
  isColumnPinnedRight,
  autoSizeColumn,
  togglePinned,
  setColumnHidden,
  openColumnPanel: () => {
    columnPanelOpen.value = true
  },
  getCellDisplayText,
  copyContextText: copyGridContextText,
  emitInsertOrderBy: (payload) => emit('insert-order-by', payload),
  emitRewriteOrderBy: (payload) => emit('rewrite-order-by', payload),
})

/** C7: bind/on objects so DwDataGridTable multi-arg emits are not collapsed. */
const formViewBind = computed(() => ({
  columns: displayColumns.value,
  columnDetails: props.columnDetails ?? [],
  pkColumns: props.pkColumns ?? [],
  row: formViewRow.value,
  rowNumber: formViewRowNumber.value,
  rowTotal: formViewRowTotal.value,
  canPrev: formViewCanPrev.value,
  canNext: formViewCanNext.value,
  editable: inlineEnabled.value,
  canUpdate: props.canUpdate,
  getCellText: (columnName: string) =>
      formViewRow.value ? getCellDisplayText(formViewRow.value, columnName) : '',
  readCellValue: (column: TableColumn) =>
      formViewRow.value ? readRawDisplayRowCell(formViewRow.value, column) : null,
}))

const formViewOn: Record<string, Function> = {
  selectPrev: () => selectFormViewRowByOffset(-1),
  selectNext: () => selectFormViewRowByOffset(1),
  fieldChange: (columnName: string, value: string) => {
    if (formViewRow.value) setCellValue(formViewRow.value, columnName, value)
  },
  openEditor: onFormViewOpenEditor,
}

const tableViewBind = computed(() => ({
  displayColumns: renderColumns.value,
  pinnedLeftCount: pinnedLeftRenderColumns.value.length,
  pinnedRightCount: pinnedRightRenderColumns.value.length,
  columnPaddingLeftPx: columnPaddingLeftPx.value,
  columnPaddingRightPx: columnPaddingRightPx.value,
  virtualRows: virtualPagedRows.value,
  useVirtual: useGridVirtual.value,
  virtualPaddingTop: virtualPaddingTop.value,
  virtualPaddingBottom: virtualPaddingBottom.value,
  tableColumnCount: tableColumnCount.value,
  tableMinWidthPx: scaledTableMinWidthPx.value,
  rowOffset: rowOffset.value,
  resizingKey: resizingKey.value,
  dragFromKey: dragFromKey.value,
  dragOverKey: dragOverKey.value,
  columnFiltersEnabled: columnFiltersEnabled.value,
  sortColumn: viewState.value?.sortColumn ?? null,
  statsColumnName: statsColumnName.value,
  inlineEnabled: inlineEnabled.value,
  enableRowDocumentView: props.enableRowDocumentView,
  indexColSelectableTitle: t('dataGrid.documentView.openHint'),
  dateTimePickerTitle: t('dataGrid.dateTimePicker.title'),
  nullValueLabel: t('common.nullValue'),
  columnColStyle,
  isPrimaryKeyColumn,
  isNumericColumn,
  columnTypeKind,
  typeColoring: props.typeColoring,
  columnTypeLabel,
  columnCommentLabel,
  sortDirection,
  isRowSelected,
  isRowMultiSelected,
  isRowModified,
  isRowPendingDelete,
  isCellActive,
  isCellInputVisible,
  showDateTimeIcon,
  isDatePickerOpen,
  getCellDisplayText,
  cellBackingText,
  bindEditingInput,
  isColumnPinned,
  isColumnPinnedRight,
  isCellInRange,
  wrapCells: wrapCells.value,
}))

const tableViewOn: Record<string, Function> = {
  headerClick: onHeaderClick,
  headerContextMenu: onHeaderContextMenu,
  headerDragStart: onHeaderDragStart,
  headerDragOver: onHeaderDragOver,
  headerDrop: onHeaderDrop,
  headerDragEnd: onHeaderDragEnd,
  resizeStart: onResizeStart,
  resizeDblClick: onResizeDblClick,
  indexColClick: onIndexColClick,
  cellMouseDown: onCellMouseDown,
  cellMouseUp: onCellMouseUp,
  cellClick: onCellClick,
  cellDblClick: onCellDblClick,
  cellMouseEnter: onCellMouseEnterForGrid,
  cellMouseLeave: onCellMouseLeave,
  cellContextMenu: onCellContextMenu,
  cellInput: onCellInput,
  cellKeydownEnter: onCellKeydownEnter,
  cellInputBlur: onCellInputBlur,
  cellInputFocus: onCellInputFocus,
  dateTimeIconClick: onDateTimeIconClick,
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
        <DataGridToolbarActions
            :full-toolbar="Boolean(fullToolbar)"
            :external-view-options="Boolean(externalViewOptions)"
            :wrap-cells="wrapCells"
            :layout-mode="layoutMode"
            :loading="Boolean(loading)"
            :has-filtered-rows="viewFilteredDisplayRows.length > 0"
            :current-page="currentPage"
            :display-total="Number(displayTotal)"
            @toggle-wrap="toggleWrapCells"
            @toggle-layout="toggleLayoutMode"
            @refresh="emit('refresh')"
        />
      </template>

      <template v-if="fullToolbar" #toolbar-end>
        <DataGridToolbarEnd
            :loaded-rows-warning="loadedRowsWarning"
            :loaded-rows-count="gridRows.length"
            :cursor-window-trimmed="cursorWindowTrimmed"
            :cursor-trimmed-rows="cursorTrimmedRows"
            :production-perf-active="Boolean(productionPerfActive)"
            :truncated-at-cap="Boolean(truncatedAtCap)"
            :truncated-cap-rows="truncatedCapRows"
            :editable="Boolean(editable)"
            :submit-action-title="submitActionTitle"
            :submit-enabled="submitEnabled"
            :discard-action-title="discardActionTitle"
            :discard-enabled="discardEnabled"
            :delete-action-title="deleteActionTitle"
            :delete-enabled="deleteEnabled"
            :inline-enabled="inlineEnabled"
            :read-only-hint="readOnlyHint"
            :show-dml-actions="showDmlActions"
            :export-enabled="exportEnabled"
            :show-export="showExport"
            :has-more="Boolean(hasMore)"
            :can-raise-max-rows="Boolean(canRaiseMaxRows)"
            :cursor-loading="Boolean(cursorLoading)"
            @submit="onSubmitClick"
            @discard="onDiscardClick"
            @add-row="onAddRowClick"
            @delete-row="onDeleteRowClick"
            @generate-dml="onGenerateDmlClick"
            @export="openExportDialog"
            @raise-max-rows="emit('raise-max-rows')"
            @load-more="emit('load-more')"
        >
          <template #toolbar-extra>
            <slot name="toolbar-extra"/>
          </template>
          <template #toolbar-tail>
            <slot name="toolbar-tail"/>
          </template>
        </DataGridToolbarEnd>
      </template>

      <template #below-toolbar>
        <DataGridFilterStrip
            :column-filters-enabled="columnFiltersEnabled"
            :show-filter-bar="showFilterBar"
            :where-clause-draft="whereClauseDraft"
            :order-clause-draft="orderClauseDraft"
            :filter-column-hints="filterColumnHints"
            :where-clause-invalid="whereClauseInvalid"
            :order-clause-invalid="orderClauseInvalid"
            :where="where"
            :order-by="orderBy"
            @update:where-clause-draft="whereClauseDraft = $event"
            @update:order-clause-draft="orderClauseDraft = $event"
            @apply="applyClauseBar()"
            @focus-change="onClauseBarFocusChange"
        />
      </template>

      <template #body>
        <GridColumnStatsPanel
            v-if="activeColumnStats"
            :stats="activeColumnStats"
            @close="dismissColumnStats"
        />

        <DataGridLoadingSkeleton
            v-if="showInitialLoading"
            :columns="[...GRID_SKELETON_COLS]"
            :rows="GRID_SKELETON_ROWS"
        />
        <div
            v-else
            ref="gridBodyRef"
            class="grid-body"
            :class="{ 'grid-body--form': layoutMode === 'form' }"
        >
          <DataGridMainViews
              :layout-mode="layoutMode"
              :form-bind="formViewBind"
              :form-on="formViewOn"
              :table-bind="tableViewBind"
              :table-on="tableViewOn"
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
