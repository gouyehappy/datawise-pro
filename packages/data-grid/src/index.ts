/**
 * @datawise/data-grid — **portable API**
 *
 * Export this surface for third-party / playground / new host grids:
 * - SPI: `configureDataGridHost` / `useDataGridHost`
 * - Presentation: `DwDataGrid`, `DwDataGridTable`, `DwGridCellText`
 * - Dialogs: `GridExportDialog`, `GridCellDetailDialog` (+ label helpers)
 * - Hooks / edit: virtualization, selection, keyboard, clipboard, `useGridPendingEdit`
 * - Pure helpers: masking, pagination, column-meta, cell JSON/binary
 *
 * Not in this package (host-only product grid): SQL-result `DataGrid.vue`
 * (entitlement / ClauseBar / plugins / mongo / DML facade). Compose the pieces above
 * instead of lifting that facade.
 */

export {
  configureDataGridHost,
  useDataGridHost,
  resetDataGridHostForTests,
  type DataGridHost,
  type DataGridPluginRenderContext,
  type DataGridExportEntitlementFace,
  type DataGridColumnMeta,
} from './data-grid-host'

export * from './types'
export * from './grid-types'
export * from './useGridColumnLayout'
export * from './useGridSelection'
export * from './useGridKeyboard'
export * from './useGridClipboard'
export * from './useGridVirtualWindow'
export * from './useGridColumnVirtualWindow'
export * from './useGridRangeSelection'
export * from './useSuppressSelectionPlugins'
export * from './meta/column-meta'
export * from './edit/useGridPendingEdit'
export {
  columnRowKey,
  readRowCell,
  readRowCellScalar,
  readRowCellText,
  type ScalarCellValue,
} from './utils/query-result-column'
export {
  DEFAULT_GRID_PAGE_SIZE_OPTIONS,
  minGridPageSizeOption,
  resolveGridPageSizeOption,
} from './utils/grid-pagination'
export {
  createEmptyInsertDraft,
  insertDraftHasValues,
  parseInsertDraftValues,
  rowKey,
  resolvePrimaryKeyColumns,
  isPrimaryKeyType,
  buildRowMutateValues,
  isSqlExpressionDefault,
  resolveNextAutoIncrementValues,
  type InsertDraftContext,
  type GridRowKeyContext,
} from './services/table-row-mutate.service'

export {default as DwDataGrid} from './components/DwDataGrid.vue'
export {default as DwDataGridTable} from './components/DwDataGridTable.vue'
export {default as DwGridCellText} from './components/DwGridCellText.vue'
export {default as GridCellDetailDialog} from './components/GridCellDetailDialog.vue'
export {default as GridExportDialog} from './components/GridExportDialog.vue'
export type {
  DwDataGridAlign,
  DwDataGridColumn,
  DwDataGridLabels,
  DwDataGridRowKey,
} from './components/dw-data-grid.types'
export {DEFAULT_DW_DATA_GRID_LABELS} from './components/dw-data-grid.types'
export type {GridCellDetailLabels} from './components/grid-cell-detail.types'
export {
  DEFAULT_GRID_CELL_DETAIL_LABELS,
  formatGridCellDetailLabel,
} from './components/grid-cell-detail.types'
export type {
  GridExportDialogLabels,
  GridExportFormat,
} from './components/grid-export-dialog.types'
export {
  DEFAULT_GRID_EXPORT_DIALOG_LABELS,
  formatGridExportLabel,
} from './components/grid-export-dialog.types'
export type {
  DataMaskTemplate,
  ExportColumn,
  ExportColumnMaskRule,
  GridExportMaskConfig,
} from './services/data-masking.service'
export {
  guessMaskTemplate,
  maskPhone,
  maskEmail,
  maskIdCard,
  maskByTemplate,
  createDefaultExportMaskConfig,
  applyExportMasking,
} from './services/data-masking.service'
export {
  defaultDwDataGridFilter,
  columnKeyFilterPredicate,
  resolveDwDataGridRowKey,
  useDwDataGridState,
} from './components/useDwDataGridState'

export type {GridCellEditorKind} from './services/grid-cell-json.service'
export {
  formatJsonEditorText,
  validateJsonEditorText,
} from './services/grid-cell-json.service'
export {
  bytesToHexDump,
  decodeBinaryCellContent,
  detectImageMimeFromBytes,
  bytesToDataUrl,
} from './services/cell-binary-preview.service'
