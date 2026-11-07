import {ref} from 'vue'
import type {GridCellCoord, GridRowId} from './types'

export type GridCellRange = {
  start: GridCellCoord
  end: GridCellCoord
}

/**
 * Rectangular cell range selection (AG-like DIY; Enterprise has richer UX).
 */
export function useGridRangeSelection() {
  const range = ref<GridCellRange | null>(null)
  const dragging = ref(false)
  const anchor = ref<GridCellCoord | null>(null)

  function clearRange() {
    range.value = null
    dragging.value = false
    anchor.value = null
  }

  function setRange(start: GridCellCoord, end: GridCellCoord) {
    range.value = {start, end}
    anchor.value = start
  }

  function extendTo(cell: GridCellCoord) {
    const start = anchor.value ?? range.value?.start ?? cell
    range.value = {start, end: cell}
    if (!anchor.value) anchor.value = start
  }

  function beginDrag(cell: GridCellCoord) {
    anchor.value = cell
    range.value = {start: cell, end: cell}
    dragging.value = true
  }

  function dragTo(cell: GridCellCoord) {
    if (!dragging.value || !anchor.value) return
    range.value = {start: anchor.value, end: cell}
  }

  function endDrag() {
    dragging.value = false
  }

  function normalized(
      rowIds: readonly GridRowId[],
      columnKeys: readonly string[],
  ): {rowIds: GridRowId[]; columnKeys: string[]} | null {
    const current = range.value
    if (!current) return null
    const r0 = rowIds.indexOf(current.start.rowId)
    const r1 = rowIds.indexOf(current.end.rowId)
    const c0 = columnKeys.indexOf(current.start.columnKey)
    const c1 = columnKeys.indexOf(current.end.columnKey)
    if (r0 < 0 || r1 < 0 || c0 < 0 || c1 < 0) return null
    const [rs, re] = r0 <= r1 ? [r0, r1] : [r1, r0]
    const [cs, ce] = c0 <= c1 ? [c0, c1] : [c1, c0]
    return {
      rowIds: rowIds.slice(rs, re + 1),
      columnKeys: columnKeys.slice(cs, ce + 1),
    }
  }

  function isCellInRange(
      rowId: GridRowId,
      columnKey: string,
      rowIds: readonly GridRowId[],
      columnKeys: readonly string[],
  ): boolean {
    const norm = normalized(rowIds, columnKeys)
    if (!norm) return false
    return norm.rowIds.includes(rowId) && norm.columnKeys.includes(columnKey)
  }

  return {
    range,
    dragging,
    clearRange,
    setRange,
    extendTo,
    beginDrag,
    dragTo,
    endDrag,
    normalized,
    isCellInRange,
  }
}
