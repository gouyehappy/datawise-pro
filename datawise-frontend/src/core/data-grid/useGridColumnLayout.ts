import {computed, ref, type Ref} from 'vue'
import {
  clampGridColumnWidth,
  createEmptyColumnLayoutState,
  GRID_COLUMN_WIDTH_DEFAULT,
  GRID_INDEX_COL_WIDTH_PX,
  type GridColumnLayoutState,
} from './types'

export type GridColumnKeyFn<T> = (column: T) => string

/**
 * Generic column width / order / pin / visibility.
 * Layout state is owned by the caller (e.g. GridViewState adapter).
 */
export function useGridColumnLayout<T>(options: {
  columns: () => readonly T[]
  columnKey: GridColumnKeyFn<T>
  /** Bound layout (viewState slice or local). Undefined → use internal local state. */
  layout: Ref<GridColumnLayoutState | undefined>
  /** Persist layout when `layout` is unbound. */
  onLocalLayoutChange?: (next: GridColumnLayoutState) => void
  resolveDefaultWidth?: (columnKey: string, column: T) => number
}) {
  const localLayout = ref<GridColumnLayoutState>(createEmptyColumnLayoutState())
  const suppressNextSortClick = ref(false)
  const dragFromKey = ref<string | null>(null)
  const dragOverKey = ref<string | null>(null)
  const resizingKey = ref<string | null>(null)

  function readLayout(): GridColumnLayoutState {
    return options.layout.value ?? localLayout.value
  }

  function writeLayout(next: GridColumnLayoutState | ((state: GridColumnLayoutState) => GridColumnLayoutState)) {
    const base = readLayout()
    const resolved = typeof next === 'function' ? next({
      columnWidths: {...base.columnWidths},
      columnOrder: [...base.columnOrder],
      pinnedColumns: [...(base.pinnedColumns ?? [])],
      pinnedRightColumns: [...(base.pinnedRightColumns ?? [])],
      hiddenColumns: [...(base.hiddenColumns ?? [])],
    }) : next
    if (options.layout.value) {
      options.layout.value = resolved
      return
    }
    localLayout.value = resolved
    options.onLocalLayoutChange?.(resolved)
  }

  const pinnedColumnKeys = computed(() => readLayout().pinnedColumns ?? [])
  const pinnedRightColumnKeys = computed(() => readLayout().pinnedRightColumns ?? [])

  const displayColumns = computed(() => {
    const columns = [...options.columns()]
    const layout = readLayout()
    const hidden = new Set(layout.hiddenColumns ?? [])
    const visible = columns.filter((column) => !hidden.has(options.columnKey(column)))
    const ordered = resolveOrderedColumns(visible, layout.columnOrder, options.columnKey)
    return resolvePinnedDisplayColumns(
        ordered,
        layout.pinnedColumns ?? [],
        layout.pinnedRightColumns ?? [],
        options.columnKey,
    )
  })

  function columnWidthPx(columnKey: string): number {
    const layout = readLayout()
    const stored = layout.columnWidths[columnKey]
    if (stored != null) return stored
    const column = options.columns().find((item) => options.columnKey(item) === columnKey)
    if (column && options.resolveDefaultWidth) {
      return options.resolveDefaultWidth(columnKey, column)
    }
    return GRID_COLUMN_WIDTH_DEFAULT
  }

  const tableMinWidthPx = computed(() =>
      GRID_INDEX_COL_WIDTH_PX
      + displayColumns.value.reduce(
          (sum, column) => sum + columnWidthPx(options.columnKey(column)),
          0,
      ),
  )

  /** Cumulative sticky offsets for multi-pin (index rail is always at left: 0). */
  function visiblePinnedKeys(side: 'left' | 'right'): string[] {
    const hidden = new Set(readLayout().hiddenColumns ?? [])
    const keys = side === 'left' ? pinnedColumnKeys.value : pinnedRightColumnKeys.value
    return keys.filter((key) => !hidden.has(key))
  }

  function pinnedLeftOffsetPx(columnKey: string): number | null {
    const keys = visiblePinnedKeys('left')
    const index = keys.indexOf(columnKey)
    if (index < 0) return null
    let left = GRID_INDEX_COL_WIDTH_PX
    for (let i = 0; i < index; i++) {
      left += columnWidthPx(keys[i]!)
    }
    return left
  }

  function pinnedRightOffsetPx(columnKey: string): number | null {
    const keys = visiblePinnedKeys('right')
    const index = keys.indexOf(columnKey)
    if (index < 0) return null
    let right = 0
    for (let i = keys.length - 1; i > index; i--) {
      right += columnWidthPx(keys[i]!)
    }
    return right
  }

  function columnColStyle(columnKey: string): Record<string, string> {
    const px = columnWidthPx(columnKey)
    const style: Record<string, string> = {
      width: `${px}px`,
      minWidth: `${px}px`,
    }
    const left = pinnedLeftOffsetPx(columnKey)
    if (left != null) style.left = `${left}px`
    const right = pinnedRightOffsetPx(columnKey)
    if (right != null) style.right = `${right}px`
    return style
  }

  function setColumnWidth(columnKey: string, width: number) {
    writeLayout((state) => ({
      ...state,
      columnWidths: {
        ...state.columnWidths,
        [columnKey]: clampGridColumnWidth(width),
      },
    }))
  }

  function moveColumn(fromKey: string, toKey: string) {
    if (fromKey === toKey) return
    writeLayout((state) => {
      const current = resolveOrderedColumns(
          options.columns().filter((c) => !(state.hiddenColumns ?? []).includes(options.columnKey(c))),
          state.columnOrder,
          options.columnKey,
      ).map((column) => options.columnKey(column))
      const fromIndex = current.indexOf(fromKey)
      const toIndex = current.indexOf(toKey)
      if (fromIndex < 0 || toIndex < 0) return state
      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return {...state, columnOrder: next}
    })
  }

  function togglePinned(columnKey: string, side: 'left' | 'right' = 'left') {
    writeLayout((state) => {
      const left = [...(state.pinnedColumns ?? [])]
      const right = [...(state.pinnedRightColumns ?? [])]
      if (side === 'left') {
        const index = left.indexOf(columnKey)
        if (index >= 0) left.splice(index, 1)
        else {
          left.push(columnKey)
          const ri = right.indexOf(columnKey)
          if (ri >= 0) right.splice(ri, 1)
        }
      } else {
        const index = right.indexOf(columnKey)
        if (index >= 0) right.splice(index, 1)
        else {
          right.push(columnKey)
          const li = left.indexOf(columnKey)
          if (li >= 0) left.splice(li, 1)
        }
      }
      return {...state, pinnedColumns: left, pinnedRightColumns: right}
    })
  }

  function setColumnHidden(columnKey: string, hidden: boolean) {
    writeLayout((state) => {
      const set = new Set(state.hiddenColumns ?? [])
      if (hidden) set.add(columnKey)
      else set.delete(columnKey)
      return {...state, hiddenColumns: [...set]}
    })
  }

  function onResizeStart(event: MouseEvent, column: T) {
    event.preventDefault()
    event.stopPropagation()
    const key = options.columnKey(column)
    const startX = event.clientX
    const startWidth = columnWidthPx(key)
    resizingKey.value = key
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'col-resize'

    function onMove(moveEvent: MouseEvent) {
      setColumnWidth(key, startWidth + (moveEvent.clientX - startX))
    }

    function onUp() {
      resizingKey.value = null
      document.body.style.cursor = previousCursor
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /** Double-click resize handle: fit to header + sample cell texts. */
  function autoSizeColumn(
      columnKey: string,
      sampleTexts: readonly string[],
      options?: {font?: string; paddingPx?: number; headerText?: string},
  ) {
    const font = options?.font ?? '13px system-ui, sans-serif'
    const padding = options?.paddingPx ?? 28
    let max = measureTextWidthPx(options?.headerText ?? columnKey, font) + padding
    for (const text of sampleTexts) {
      max = Math.max(max, measureTextWidthPx(text || ' ', font) + padding)
    }
    setColumnWidth(columnKey, max)
  }

  function onResizeDoubleClick(
      event: MouseEvent,
      column: T,
      sampleTexts: readonly string[],
      headerText?: string,
  ) {
    event.preventDefault()
    event.stopPropagation()
    suppressNextSortClick.value = true
    const key = options.columnKey(column)
    autoSizeColumn(key, sampleTexts, {headerText: headerText ?? key})
  }

  function onHeaderDragStart(event: DragEvent, column: T) {
    const key = options.columnKey(column)
    dragFromKey.value = key
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', key)
    }
  }

  function onHeaderDragOver(event: DragEvent, column: T) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dragOverKey.value = options.columnKey(column)
  }

  function onHeaderDrop(event: DragEvent, column: T) {
    event.preventDefault()
    const fromKey = dragFromKey.value || event.dataTransfer?.getData('text/plain')
    const toKey = options.columnKey(column)
    if (fromKey && toKey && fromKey !== toKey) {
      suppressNextSortClick.value = true
      moveColumn(fromKey, toKey)
    }
    dragFromKey.value = null
    dragOverKey.value = null
  }

  function onHeaderDragEnd() {
    if (dragFromKey.value) {
      suppressNextSortClick.value = true
    }
    dragFromKey.value = null
    dragOverKey.value = null
  }

  function consumeSuppressSortClick(): boolean {
    if (!suppressNextSortClick.value) return false
    suppressNextSortClick.value = false
    return true
  }

  return {
    displayColumns,
    pinnedColumnKeys,
    pinnedRightColumnKeys,
    tableMinWidthPx,
    columnWidthPx,
    columnColStyle,
    setColumnWidth,
    autoSizeColumn,
    moveColumn,
    togglePinned,
    setColumnHidden,
    writeLayout,
    readLayout,
    suppressNextSortClick,
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
  }
}

let measureCanvas: HTMLCanvasElement | null = null

export function measureTextWidthPx(text: string, font: string): number {
  if (typeof document === 'undefined') return Math.ceil(text.length * 8)
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return Math.ceil(text.length * 8)
  ctx.font = font
  return Math.ceil(ctx.measureText(text).width)
}

export function resolveOrderedColumns<T>(
    columns: readonly T[],
    columnOrder: string[] | undefined,
    columnKey: GridColumnKeyFn<T>,
): T[] {
  if (!columnOrder?.length) return [...columns]
  const byKey = new Map(columns.map((column) => [columnKey(column), column]))
  const ordered: T[] = []
  const used = new Set<string>()
  for (const key of columnOrder) {
    const column = byKey.get(key)
    if (!column || used.has(key)) continue
    ordered.push(column)
    used.add(key)
  }
  for (const column of columns) {
    const key = columnKey(column)
    if (used.has(key)) continue
    ordered.push(column)
  }
  return ordered
}

/** Left pins → middle → right pins (preserves each pin-list order). */
export function resolvePinnedDisplayColumns<T>(
    orderedColumns: readonly T[],
    pinnedLeftKeys: readonly string[],
    pinnedRightKeys: readonly string[],
    columnKey: GridColumnKeyFn<T>,
): T[] {
  const byKey = new Map(orderedColumns.map((column) => [columnKey(column), column]))
  const left: T[] = []
  const right: T[] = []
  const used = new Set<string>()

  for (const key of pinnedLeftKeys) {
    const column = byKey.get(key)
    if (!column || used.has(key)) continue
    left.push(column)
    used.add(key)
  }
  for (const key of pinnedRightKeys) {
    const column = byKey.get(key)
    if (!column || used.has(key)) continue
    right.push(column)
    used.add(key)
  }

  const middle = orderedColumns.filter((column) => !used.has(columnKey(column)))
  return [...left, ...middle, ...right]
}
