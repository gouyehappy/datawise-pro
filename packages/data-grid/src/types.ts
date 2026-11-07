/**
 * Generic data-grid core types (AG-inspired, engine-agnostic).
 * No dependency on workspace / SQL / plugins.
 */

export type GridRowId = string

export type GridSortDirection = 'asc' | 'desc'

/** Column layout slice — independent of filter/sort persistence. */
export type GridColumnLayoutState = {
  columnWidths: Record<string, number>
  columnOrder: string[]
  /** Left-pinned data column keys (index rail is always sticky separately). */
  pinnedColumns?: string[]
  /** Right-pinned data column keys. */
  pinnedRightColumns?: string[]
  /** Hidden column keys. */
  hiddenColumns?: string[]
}

export type GridCellCoord = {
  rowId: GridRowId
  columnKey: string
}

export type GridSelectionState = {
  /** Primary row — drives edit/delete actions. */
  primaryId: GridRowId | null
  /** Multi-select set (includes primary when set). */
  selectedIds: Set<GridRowId>
  /** Anchor for Shift+click range. */
  anchorId: GridRowId | null
}

export type GridColumnDef = {
  /** Stable key (e.g. columnRowKey). */
  key: string
  /** Display label. */
  label: string
  /** Optional type hint for header subtitle. */
  typeLabel?: string
  numeric?: boolean
  primaryKey?: boolean
}

export const GRID_INDEX_COL_WIDTH_PX = 36
export const GRID_COLUMN_WIDTH_DEFAULT = 148
export const GRID_COLUMN_WIDTH_MIN = 64
export const GRID_COLUMN_WIDTH_MAX = 720

export function clampGridColumnWidth(width: number): number {
  return Math.min(GRID_COLUMN_WIDTH_MAX, Math.max(GRID_COLUMN_WIDTH_MIN, Math.round(width)))
}

export function createEmptyColumnLayoutState(): GridColumnLayoutState {
  return {
    columnWidths: {},
    columnOrder: [],
    pinnedColumns: [],
    pinnedRightColumns: [],
    hiddenColumns: [],
  }
}
