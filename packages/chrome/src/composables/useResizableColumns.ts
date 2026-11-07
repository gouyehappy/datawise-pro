import {onUnmounted, ref, watch, type Ref} from 'vue'

export interface ResizableColumnDef {
  key: string
  label: string
  defaultWidth: number
  minWidth?: number
}

function minWidthFor(column: ResizableColumnDef): number {
  return column.minWidth ?? 56
}

function loadWidths(columns: ResizableColumnDef[], storageKey?: string): number[] {
  if (storageKey) {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as number[]
        if (Array.isArray(parsed) && parsed.length === columns.length) {
          return parsed.map((width, index) =>
            Math.max(minWidthFor(columns[index]), Math.round(width)),
          )
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
  }
  return columns.map((column) => column.defaultWidth)
}

export function useResizableColumns(
  columns: ResizableColumnDef[],
  storageKey?: string,
): {
  widths: Ref<number[]>
  startResize: (index: number, event: PointerEvent) => void
} {
  const widths = ref(loadWidths(columns, storageKey))

  watch(
    widths,
    (next) => {
      if (!storageKey) return
      localStorage.setItem(storageKey, JSON.stringify(next))
    },
    {deep: true},
  )

  let activeIndex = -1
  let startX = 0
  let startWidth = 0
  let captureTarget: HTMLElement | null = null

  function onPointerMove(event: PointerEvent) {
    if (activeIndex < 0) return
    const delta = event.clientX - startX
    const min = minWidthFor(columns[activeIndex])
    widths.value[activeIndex] = Math.max(min, Math.round(startWidth + delta))
  }

  function onPointerUp() {
    activeIndex = -1
    captureTarget = null
  }

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  onUnmounted(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  })

  function startResize(index: number, event: PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    activeIndex = index
    startX = event.clientX
    startWidth = widths.value[index] ?? columns[index].defaultWidth
    captureTarget = event.currentTarget as HTMLElement
    captureTarget.setPointerCapture(event.pointerId)
  }

  return {widths, startResize}
}
