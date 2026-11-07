/**
 * DataGrid host module — dual track:
 *
 * | Surface | Where | Use for |
 * |---------|-------|---------|
 * | Portable API | `@datawise/data-grid` | `DwDataGrid` / Table / CellDetail / Export dialog / SPI / hooks |
 * | Host wrappers | this barrel’s Dw* / dialogs | vue-i18n + `TableColumn` thin adapters over the package |
 * | Product SQL grid | `components/DataGrid.vue` | Query results only — **host-only by design** (not package-bound) |
 *
 * Prefer `@/core/data-grid` deep imports for host code. Workspace SQL/export shims:
 * `@/features/workspace/data-grid` (re-exports core dialogs/services).
 */

/** Package SPI aliases (portable API lives on `@datawise/data-grid`). */
export {
  configureDataGridHost as configureFrameworkDataGridHost,
  useDataGridHost as useFrameworkDataGridHost,
  resetDataGridHostForTests as resetFrameworkDataGridHostForTests,
} from '@datawise/data-grid'

export * from './types'
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
export * from './composables/useDataGridClauseBar'
export * from './composables/useDataGridHoverPreview'

/** @deprecated Host-only SQL-result workbench — use DwDataGrid from package for new work. */
export {default as DataGrid} from './components/DataGrid.vue'
/** Portable presentational shell (host thin wrapper → `@datawise/data-grid`). */
export {default as DwDataGrid} from './components/DwDataGrid.vue'
export {default as DwDataGridTable} from './components/DwDataGridTable.vue'
export {default as DwGridCellText} from './components/DwGridCellText.vue'
export {default as GridCellDetailDialog} from './components/GridCellDetailDialog.vue'
export {default as GridColumnPanel} from './components/GridColumnPanel.vue'
export type {
  DwDataGridAlign,
  DwDataGridColumn,
  DwDataGridLabels,
  DwDataGridRowKey,
  GridCellDetailLabels,
  GridCellEditorKind,
} from '@datawise/data-grid'
export {
  DEFAULT_DW_DATA_GRID_LABELS,
  DEFAULT_GRID_CELL_DETAIL_LABELS,
} from '@datawise/data-grid'
export {
  defaultDwDataGridFilter,
  columnKeyFilterPredicate,
  resolveDwDataGridRowKey,
  useDwDataGridState,
} from '@datawise/data-grid'
