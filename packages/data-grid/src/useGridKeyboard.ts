import type {Ref} from 'vue'
import type {GridCellCoord, GridRowId} from './types'

export type GridKeyboardHandlers = {
  moveFocus: (next: GridCellCoord) => boolean
  beginEdit?: (cell: GridCellCoord) => void
  stopEdit?: () => void
  isEditing?: () => boolean
  copy?: () => void
  paste?: () => void
  /** Optional: extend cell range with Shift+arrows. */
  extendRange?: (next: GridCellCoord) => void
  /** Optional: clear range when moving without Shift. */
  clearRange?: () => void
}

/**
 * Keyboard navigation for a rectangular grid of rowIds × columnKeys.
 * AG-community aligned: arrows, Tab, Home/End, Ctrl+Home/End, PageUp/Down, F2, Enter, Esc, Ctrl+C/V.
 */
export function useGridKeyboard(options: {
  focusCell: Ref<GridCellCoord | null>
  rowIds: () => readonly GridRowId[]
  columnKeys: () => readonly string[]
  handlers: GridKeyboardHandlers
  suppressNavigation?: () => boolean
  /** Rows to jump on PageUp/PageDown (default 10). */
  pageSize?: () => number
}) {
  function resolveNeighbor(
      cell: GridCellCoord,
      dRow: number,
      dCol: number,
  ): GridCellCoord | null {
    const rows = options.rowIds()
    const cols = options.columnKeys()
    const rowIndex = rows.indexOf(cell.rowId)
    const colIndex = cols.indexOf(cell.columnKey)
    if (rowIndex < 0 || colIndex < 0) return null
    const nextRow = rows[rowIndex + dRow]
    const nextCol = cols[colIndex + dCol]
    if (!nextRow || !nextCol) return null
    return {rowId: nextRow, columnKey: nextCol}
  }

  function resolveAbsolute(
      cell: GridCellCoord,
      rowMode: 'same' | 'first' | 'last' | 'pageUp' | 'pageDown',
      colMode: 'same' | 'first' | 'last',
  ): GridCellCoord | null {
    const rows = options.rowIds()
    const cols = options.columnKeys()
    if (!rows.length || !cols.length) return null
    const rowIndex = rows.indexOf(cell.rowId)
    const colIndex = cols.indexOf(cell.columnKey)
    if (rowIndex < 0 || colIndex < 0) return null

    let nextRowIndex = rowIndex
    if (rowMode === 'first') nextRowIndex = 0
    else if (rowMode === 'last') nextRowIndex = rows.length - 1
    else if (rowMode === 'pageUp') {
      nextRowIndex = Math.max(0, rowIndex - Math.max(1, options.pageSize?.() ?? 10))
    } else if (rowMode === 'pageDown') {
      nextRowIndex = Math.min(rows.length - 1, rowIndex + Math.max(1, options.pageSize?.() ?? 10))
    }

    let nextColIndex = colIndex
    if (colMode === 'first') nextColIndex = 0
    else if (colMode === 'last') nextColIndex = cols.length - 1

    const nextRow = rows[nextRowIndex]
    const nextCol = cols[nextColIndex]
    if (!nextRow || !nextCol) return null
    return {rowId: nextRow, columnKey: nextCol}
  }

  function applyMove(event: KeyboardEvent, next: GridCellCoord | null) {
    if (!next) return
    event.preventDefault()
    if (event.shiftKey && options.handlers.extendRange) {
      options.handlers.extendRange(next)
      options.handlers.moveFocus(next)
      return
    }
    options.handlers.clearRange?.()
    options.handlers.moveFocus(next)
  }

  function onKeyDown(event: KeyboardEvent) {
    const editing = options.handlers.isEditing?.() ?? false
    const focus = options.focusCell.value

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      options.handlers.copy?.()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      if (!editing) {
        event.preventDefault()
        options.handlers.paste?.()
      }
      return
    }

    if (event.key === 'Escape') {
      if (editing) {
        event.preventDefault()
        options.handlers.stopEdit?.()
      }
      return
    }

    if (event.key === 'F2') {
      if (!focus || editing) return
      event.preventDefault()
      options.handlers.beginEdit?.(focus)
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      if (!focus) return
      if (editing) {
        event.preventDefault()
        options.handlers.stopEdit?.()
        return
      }
      event.preventDefault()
      options.handlers.beginEdit?.(focus)
      return
    }

    if (editing || options.suppressNavigation?.()) return
    if (!focus) return

    const ctrl = event.ctrlKey || event.metaKey

    if (event.key === 'Home') {
      applyMove(
          event,
          resolveAbsolute(focus, ctrl ? 'first' : 'same', 'first'),
      )
      return
    }
    if (event.key === 'End') {
      applyMove(
          event,
          resolveAbsolute(focus, ctrl ? 'last' : 'same', 'last'),
      )
      return
    }
    if (event.key === 'PageUp') {
      applyMove(event, resolveAbsolute(focus, 'pageUp', 'same'))
      return
    }
    if (event.key === 'PageDown') {
      applyMove(event, resolveAbsolute(focus, 'pageDown', 'same'))
      return
    }

    let dRow = 0
    let dCol = 0
    switch (event.key) {
      case 'ArrowUp':
        dRow = -1
        break
      case 'ArrowDown':
        dRow = 1
        break
      case 'ArrowLeft':
        dCol = -1
        break
      case 'ArrowRight':
        dCol = 1
        break
      case 'Tab':
        dCol = event.shiftKey ? -1 : 1
        break
      default:
        return
    }

    const next = resolveNeighbor(focus, dRow, dCol)
    applyMove(event, next)
  }

  return {onKeyDown, resolveNeighbor, resolveAbsolute}
}
