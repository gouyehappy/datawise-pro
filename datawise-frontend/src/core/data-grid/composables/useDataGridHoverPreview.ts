import {nextTick, onBeforeUnmount, ref} from 'vue'
import type {TableColumn} from '@/core/types'
import {formatCellFullValue} from '@/core/utils/cell-value-format'

export type CellHoverPlacement = 'below' | 'above' | 'right' | 'left'

export type CellHoverPreviewState = {
  rowId: string
  column: string
  content: string
  placement: CellHoverPlacement
  style: Record<string, string>
  scrollable: boolean
}

type HoverRow = {id: string; kind?: string}

/**
 * Delayed cell hover preview placement for DataGrid.
 */
export function useDataGridHoverPreview<T extends HoverRow>(options: {
  isCellInputVisible: (item: T, columnName: string) => boolean
  readRawCell: (item: T, column: TableColumn) => unknown
  canExpandCell: (item: T, column: TableColumn) => boolean
}) {
  const cellHoverPreview = ref<CellHoverPreviewState | null>(null)
  const cellHoverPreviewEl = ref<HTMLElement | null>(null)
  const HOVER_PREVIEW_SHOW_DELAY_MS = 420
  const HOVER_PREVIEW_HIDE_DELAY_MS = 280
  let cellHoverPreviewShowTimer: number | null = null
  let cellHoverPreviewHideTimer: number | null = null

  function clearCellHoverPreviewShowTimer() {
    if (cellHoverPreviewShowTimer != null) {
      window.clearTimeout(cellHoverPreviewShowTimer)
      cellHoverPreviewShowTimer = null
    }
  }

  function clearCellHoverPreviewHideTimer() {
    if (cellHoverPreviewHideTimer != null) {
      window.clearTimeout(cellHoverPreviewHideTimer)
      cellHoverPreviewHideTimer = null
    }
  }

  function clearCellHoverPreviewTimer() {
    clearCellHoverPreviewShowTimer()
    clearCellHoverPreviewHideTimer()
  }

  function hideCellHoverPreview() {
    clearCellHoverPreviewTimer()
    cellHoverPreview.value = null
  }

  function scheduleHideCellHoverPreview() {
    clearCellHoverPreviewHideTimer()
    cellHoverPreviewHideTimer = window.setTimeout(() => {
      cellHoverPreviewHideTimer = null
      cellHoverPreview.value = null
    }, HOVER_PREVIEW_HIDE_DELAY_MS)
  }

  function isCellVisuallyTruncated(cellEl: HTMLElement): boolean {
    const textEl = cellEl.querySelector('.dw-grid-cell-text') as HTMLElement | null
    if (!textEl || textEl.classList.contains('is-backing-host') || textEl.classList.contains('is-backing')) {
      return false
    }
    if (textEl.dataset.overflow === '1') return true
    if (textEl.dataset.overflow === '0') return false
    return textEl.scrollWidth > textEl.clientWidth + 1
        || textEl.scrollHeight > textEl.clientHeight + 1
  }

  function shouldShowCellHoverPreview(
      item: T,
      column: TableColumn,
      cellEl: HTMLElement,
  ): boolean {
    if (options.isCellInputVisible(item, column.name)) return false
    const raw = options.readRawCell(item, column)
    const full = formatCellFullValue(raw)
    if (!full) return false
    return options.canExpandCell(item, column) || isCellVisuallyTruncated(cellEl)
  }

  function estimateHoverPreviewSize(content: string, cellWidth: number, maxW: number, maxH: number) {
    const HEAD = 28
    const PAD_X = 36
    const PAD_Y = 28
    const LINE = 20
    const CHAR_W = 8.1
    const lines = content.split('\n')
    const longest = lines.reduce((max, line) => Math.max(max, [...line].length), 0)
    const preferW = Math.min(
        maxW,
        Math.max(cellWidth, 180, Math.ceil(longest * CHAR_W) + PAD_X),
    )
    const charsPerLine = Math.max(12, Math.floor((preferW - PAD_X) / CHAR_W))
    const wrappedLines = lines.reduce((sum, line) => {
      const len = Math.max([...line].length, 1)
      return sum + Math.max(1, Math.ceil(len / charsPerLine))
    }, 0)
    const contentH = HEAD + PAD_Y + wrappedLines * LINE
    const preferH = Math.min(maxH, Math.max(72, contentH + 6))
    return {preferW, preferH, wrappedLines}
  }

  function refineCellHoverPreviewSize(
      placement: CellHoverPlacement,
      maxH: number,
      edge: number,
      gap: number,
      cellRect: DOMRect,
  ) {
    const root = cellHoverPreviewEl.value
    const preview = cellHoverPreview.value
    if (!root || !preview) return
    const body = root.querySelector('.cell-hover-preview__body') as HTMLElement | null
    if (!body) return

    const overflow = body.scrollHeight - body.clientHeight
    if (overflow <= 1) {
      if (preview.scrollable) {
        cellHoverPreview.value = {...preview, scrollable: false}
      }
      return
    }

    const vw = window.innerWidth
    const vh = window.innerHeight
    const currentMax = Number.parseFloat(preview.style.maxHeight || '0') || root.offsetHeight
    const needed = Math.min(maxH, currentMax + overflow + 8)
    const nextStyle: Record<string, string> = {
      ...preview.style,
      maxHeight: `${needed}px`,
    }

    if (placement === 'above') {
      const bottom = cellRect.top - gap
      nextStyle.top = `${Math.max(edge, bottom - needed)}px`
    } else if (placement === 'below') {
      nextStyle.top = `${Math.min(cellRect.bottom + gap, vh - edge - Math.min(needed, vh - edge * 2))}px`
    } else {
      const height = Math.min(needed, vh - edge * 2)
      let top = cellRect.top + (cellRect.height - height) / 2
      top = Math.min(Math.max(edge, top), vh - edge - height)
      nextStyle.top = `${top}px`
    }

    if (body.scrollWidth > body.clientWidth + 1) {
      const curW = root.offsetWidth
      const grow = Math.min(480, vw - edge * 2, curW + (body.scrollWidth - body.clientWidth) + 16)
      nextStyle.width = `${grow}px`
    }

    const stillTight = needed >= maxH - 2
    cellHoverPreview.value = {
      ...preview,
      style: nextStyle,
      scrollable: stillTight,
    }
  }

  function placeCellHoverPreview(cellEl: HTMLElement, content: string, rowId: string, column: string) {
    const HOVER_PREVIEW_MAX_CHARS = 4000
    const GAP = 8
    const EDGE = 10
    const MAX_W = 480
    const MAX_H = 320
    const MIN_SIDE = 140
    const previewContent = content.length > HOVER_PREVIEW_MAX_CHARS
        ? `${content.slice(0, HOVER_PREVIEW_MAX_CHARS)}\n…`
        : content
    const rect = cellEl.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const {preferW, preferH, wrappedLines} = estimateHoverPreviewSize(
        previewContent,
        rect.width,
        Math.min(MAX_W, vw - EDGE * 2),
        Math.min(MAX_H, vh - EDGE * 2),
    )
    const likelyScrollable = wrappedLines > 8 || previewContent.length > 480

    const space = {
      below: Math.max(0, vh - rect.bottom - EDGE - GAP),
      above: Math.max(0, rect.top - EDGE - GAP),
      right: Math.max(0, vw - rect.right - EDGE - GAP),
      left: Math.max(0, rect.left - EDGE - GAP),
    }

    type Candidate = {
      placement: CellHoverPlacement
      top: number
      left: number
      width: number
      height: number
      score: number
    }

    const candidates: Candidate[] = []

    const pushVertical = (placement: 'below' | 'above', available: number) => {
      if (available < 48) return
      const width = Math.min(preferW, vw - EDGE * 2)
      const height = Math.min(preferH, available)
      let left = rect.left + (rect.width - width) / 2
      left = Math.min(Math.max(EDGE, left), vw - EDGE - width)
      const top = placement === 'below'
          ? rect.bottom + GAP
          : rect.top - GAP - height
      const area = width * height
      const fits = height >= preferH * 0.92 ? 1 : height / preferH
      const bias = placement === 'below' ? 40 : (fits >= 1 ? 20 : 0)
      candidates.push({
        placement,
        top,
        left,
        width,
        height,
        score: area * fits + bias * 1000,
      })
    }

    const pushHorizontal = (placement: 'right' | 'left', available: number) => {
      if (available < MIN_SIDE) return
      const width = Math.min(preferW, available)
      const height = Math.min(preferH, vh - EDGE * 2)
      const left = placement === 'right'
          ? rect.right + GAP
          : rect.left - GAP - width
      let top = rect.top + (rect.height - height) / 2
      top = Math.min(Math.max(EDGE, top), vh - EDGE - height)
      const area = width * height
      const fits = width >= preferW * 0.92 ? 1 : width / preferW
      const verticalBest = Math.max(space.below, space.above)
      const verticalTight = verticalBest < preferH * 0.75
      const bias = (verticalTight ? 80 : 0) + (preferW > 280 ? 20 : 0)
      candidates.push({
        placement,
        top,
        left,
        width,
        height,
        score: area * fits + bias * 1000,
      })
    }

    pushVertical('below', space.below)
    pushVertical('above', space.above)
    pushHorizontal('right', space.right)
    pushHorizontal('left', space.left)

    if (candidates.length === 0) {
      const order: CellHoverPlacement[] = ['below', 'above', 'right', 'left']
      const bestDir = order.reduce((a, b) => (space[b] > space[a] ? b : a))
      const width = Math.min(preferW, vw - EDGE * 2, Math.max(MIN_SIDE, space.left + space.right || preferW))
      const height = Math.min(preferH, vh - EDGE * 2, Math.max(48, space.above + space.below || preferH))
      if (bestDir === 'below' || bestDir === 'above') {
        let left = rect.left + (rect.width - width) / 2
        left = Math.min(Math.max(EDGE, left), vw - EDGE - width)
        candidates.push({
          placement: bestDir,
          top: bestDir === 'below'
              ? Math.min(rect.bottom + GAP, vh - EDGE - Math.min(height, Math.max(space.below, 48)))
              : Math.max(EDGE, rect.top - GAP - Math.min(height, Math.max(space.above, 48))),
          left,
          width,
          height: Math.min(height, Math.max(space[bestDir], 48)),
          score: 0,
        })
      } else {
        let top = rect.top + (rect.height - height) / 2
        top = Math.min(Math.max(EDGE, top), vh - EDGE - height)
        candidates.push({
          placement: bestDir,
          top,
          left: bestDir === 'right'
              ? Math.min(rect.right + GAP, vw - EDGE - Math.min(width, Math.max(space.right, MIN_SIDE)))
              : Math.max(EDGE, rect.left - GAP - Math.min(width, Math.max(space.left, MIN_SIDE))),
          width: Math.min(width, Math.max(space[bestDir], MIN_SIDE)),
          height,
          score: 0,
        })
      }
    }

    const best = candidates.reduce((a, b) => (b.score > a.score ? b : a))
    const anchorPad = 12
    const style: Record<string, string> = {
      top: `${best.top}px`,
      left: `${best.left}px`,
      width: `${best.width}px`,
      maxWidth: `${Math.min(MAX_W, vw - EDGE * 2)}px`,
      maxHeight: `${best.height}px`,
    }

    if (best.placement === 'below' || best.placement === 'above') {
      const anchorX = Math.min(
          Math.max(anchorPad, rect.left + rect.width / 2 - best.left),
          best.width - anchorPad,
      )
      style['--cell-hover-anchor-x'] = `${anchorX}px`
    } else {
      const anchorY = Math.min(
          Math.max(anchorPad, rect.top + rect.height / 2 - best.top),
          best.height - anchorPad,
      )
      style['--cell-hover-anchor-y'] = `${anchorY}px`
    }

    cellHoverPreview.value = {
      rowId,
      column,
      content: previewContent,
      placement: best.placement,
      style,
      scrollable: likelyScrollable,
    }

    void nextTick(() => {
      refineCellHoverPreviewSize(best.placement, Math.min(MAX_H, vh - EDGE * 2), EDGE, GAP, rect)
    })
  }

  /** Prefer the cell <td>; delegated tbody listeners make currentTarget the table body. */
  function resolveHoverCellEl(event: MouseEvent): HTMLElement | null {
    const target = event.target
    if (target instanceof Element) {
      const cell = target.closest('td[data-dw-col], td.data-cell') as HTMLElement | null
      if (cell) return cell
    }
    const current = event.currentTarget
    if (current instanceof HTMLElement && current.matches?.('td')) return current
    return null
  }

  function onCellMouseEnter(
      event: MouseEvent,
      item: T,
      column: TableColumn,
  ) {
    const cellEl = resolveHoverCellEl(event)
    if (!cellEl) return
    clearCellHoverPreviewHideTimer()
    clearCellHoverPreviewShowTimer()
    if (!shouldShowCellHoverPreview(item, column, cellEl)) {
      hideCellHoverPreview()
      return
    }
    const preview = cellHoverPreview.value
    if (preview?.rowId === item.id && preview.column === column.name) {
      return
    }
    const content = formatCellFullValue(options.readRawCell(item, column))
    const rowId = item.id
    const columnName = column.name
    cellHoverPreviewShowTimer = window.setTimeout(() => {
      cellHoverPreviewShowTimer = null
      if (options.isCellInputVisible(item, columnName)) return
      // Cell may have been recycled after a page flip / virt window move.
      if (!cellEl.isConnected) return
      placeCellHoverPreview(cellEl, content, rowId, columnName)
    }, HOVER_PREVIEW_SHOW_DELAY_MS)
  }

  function onCellMouseLeave(
      item: T,
      column: TableColumn,
  ) {
    clearCellHoverPreviewShowTimer()
    const preview = cellHoverPreview.value
    if (!preview || (preview.rowId === item.id && preview.column === column.name)) {
      scheduleHideCellHoverPreview()
    }
  }

  function onCellHoverPreviewEnter() {
    clearCellHoverPreviewHideTimer()
    clearCellHoverPreviewShowTimer()
  }

  function onCellHoverPreviewLeave() {
    scheduleHideCellHoverPreview()
  }

  onBeforeUnmount(hideCellHoverPreview)

  return {
    cellHoverPreview,
    cellHoverPreviewEl,
    hideCellHoverPreview,
    clearCellHoverPreviewShowTimer,
    onCellMouseEnter,
    onCellMouseLeave,
    onCellHoverPreviewEnter,
    onCellHoverPreviewLeave,
  }
}
