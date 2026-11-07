<script setup lang="ts">
import {computed} from 'vue'
import {DwIcon} from '@/core/icons'
import {columnRowKey} from '@/core/utils/query-result-column'
import type {TableColumn} from '@/core/types'
import type {GridDisplayRow} from '../edit/useGridPendingEdit'
import type {VisibleGridRow} from '../useGridVirtualWindow'
import {GRID_INDEX_COL_WIDTH_PX} from '../types'
import DwGridCellText from './DwGridCellText.vue'
import './styles/data-grid-table.css'

const props = withDefaults(defineProps<{
  displayColumns: TableColumn[]
  virtualRows: VisibleGridRow<GridDisplayRow>[]
  useVirtual: boolean
  virtualPaddingTop: number
  virtualPaddingBottom: number
  /** Count of leading left-pinned columns in displayColumns. */
  pinnedLeftCount?: number
  /** Count of trailing right-pinned columns in displayColumns. */
  pinnedRightCount?: number
  /** Offscreen scrollable width left of the visible window (px). */
  columnPaddingLeftPx?: number
  /** Offscreen scrollable width right of the visible window (px). */
  columnPaddingRightPx?: number
  tableColumnCount: number
  tableMinWidthPx: number
  rowOffset: number
  resizingKey: string | null
  dragFromKey: string | null
  dragOverKey: string | null
  columnFiltersEnabled: boolean
  sortColumn: string | null
  statsColumnName: string | null
  inlineEnabled: boolean
  enableRowDocumentView: boolean
  indexColSelectableTitle?: string
  dateTimePickerTitle: string
  nullValueLabel: string
  columnColStyle: (columnKey: string) => Record<string, string>
  isPrimaryKeyColumn: (column: TableColumn) => boolean
  isNumericColumn: (column: TableColumn) => boolean
  columnTypeKind?: (column: TableColumn) => string
  typeColoring?: boolean
  columnTypeLabel: (column: TableColumn) => string
  columnCommentLabel?: (column: TableColumn) => string
  sortDirection: (columnKey: string) => 'asc' | 'desc' | null
  isRowSelected: (item: GridDisplayRow) => boolean
  isRowModified: (item: GridDisplayRow) => boolean
  isRowPendingDelete: (item: GridDisplayRow) => boolean
  isCellActive: (item: GridDisplayRow, columnName: string) => boolean
  isCellInputVisible: (item: GridDisplayRow, columnName: string) => boolean
  showDateTimeIcon: (item: GridDisplayRow, column: TableColumn) => boolean
  isDatePickerOpen: (item: GridDisplayRow, columnName: string) => boolean
  getCellDisplayText: (item: GridDisplayRow, columnName: string) => string
  cellBackingText: (item: GridDisplayRow, columnName: string) => string
  bindEditingInput: (el: unknown, item: GridDisplayRow, columnName: string) => void
  /** Multi-select highlight (AG-aligned). */
  isRowMultiSelected?: (item: GridDisplayRow) => boolean
  isColumnPinned?: (columnKey: string) => boolean
  isColumnPinnedRight?: (columnKey: string) => boolean
  isCellInRange?: (item: GridDisplayRow, columnName: string) => boolean
  wrapCells?: boolean
}>(), {
  pinnedLeftCount: 0,
  pinnedRightCount: 0,
  columnPaddingLeftPx: 0,
  columnPaddingRightPx: 0,
})

const pinnedLeftColumns = computed(() =>
    props.displayColumns.slice(0, Math.max(0, props.pinnedLeftCount)),
)
const pinnedRightColumns = computed(() => {
  const count = Math.max(0, props.pinnedRightCount)
  if (count <= 0) return [] as TableColumn[]
  return props.displayColumns.slice(-count)
})
const scrollableVisibleColumns = computed(() => {
  const left = Math.max(0, props.pinnedLeftCount)
  const right = Math.max(0, props.pinnedRightCount)
  const end = Math.max(left, props.displayColumns.length - right)
  return props.displayColumns.slice(left, end)
})

type ColumnSlot =
    | {kind: 'pad'; key: string; width: number}
    | {kind: 'col'; key: string; column: TableColumn}

const columnSlots = computed((): ColumnSlot[] => {
  const slots: ColumnSlot[] = []
  for (const column of pinnedLeftColumns.value) {
    slots.push({kind: 'col', key: `col:${columnRowKey(column)}`, column})
  }
  if (props.columnPaddingLeftPx > 0) {
    slots.push({kind: 'pad', key: 'pad:left', width: props.columnPaddingLeftPx})
  }
  for (const column of scrollableVisibleColumns.value) {
    slots.push({kind: 'col', key: `col:${columnRowKey(column)}`, column})
  }
  if (props.columnPaddingRightPx > 0) {
    slots.push({kind: 'pad', key: 'pad:right', width: props.columnPaddingRightPx})
  }
  for (const column of pinnedRightColumns.value) {
    slots.push({kind: 'col', key: `col:${columnRowKey(column)}`, column})
  }
  return slots
})

const emit = defineEmits<{
  headerClick: [event: MouseEvent, column: TableColumn]
  headerContextMenu: [event: MouseEvent, column: TableColumn]
  headerDragStart: [event: DragEvent, column: TableColumn]
  headerDragOver: [event: DragEvent, column: TableColumn]
  headerDrop: [event: DragEvent, column: TableColumn]
  headerDragEnd: []
  resizeStart: [event: MouseEvent, column: TableColumn]
  resizeDblClick: [event: MouseEvent, column: TableColumn]
  indexColClick: [item: GridDisplayRow, rowIndex: number, event: MouseEvent]
  cellMouseDown: [event: MouseEvent, item: GridDisplayRow, columnName: string, rowIndex: number]
  cellMouseUp: [event: MouseEvent]
  cellClick: [event: MouseEvent, item: GridDisplayRow, columnName: string]
  cellDblClick: [item: GridDisplayRow, columnName: string, event: MouseEvent, rowIndex: number]
  cellMouseEnter: [event: MouseEvent, item: GridDisplayRow, column: TableColumn]
  cellMouseLeave: [item: GridDisplayRow, column: TableColumn]
  cellContextMenu: [event: MouseEvent, item: GridDisplayRow, column: TableColumn]
  cellInput: [item: GridDisplayRow, columnName: string, value: string]
  cellKeydownEnter: [event: KeyboardEvent]
  cellInputBlur: [item: GridDisplayRow]
  cellInputFocus: [item: GridDisplayRow, columnName: string]
  dateTimeIconClick: [item: GridDisplayRow, columnName: string]
}>()

function onTableSelectStart(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
  event.preventDefault()
}

type ResolvedCell = {
  item: GridDisplayRow
  rowIndex: number
  column: TableColumn
  columnName: string
  cellEl: HTMLElement
}

function resolveRowEntry(rowIndex: number) {
  // virtualRows is small (page or virt window); linear scan beats a rebuilt Map each event.
  return props.virtualRows.find((entry) => entry.index === rowIndex) ?? null
}

function resolveCellFromEvent(event: Event): ResolvedCell | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  if (target.closest('input, button, textarea, a')) return null
  const cellEl = target.closest('td[data-dw-row][data-dw-col]') as HTMLElement | null
  if (!cellEl) return null
  const rowIndex = Number(cellEl.dataset.dwRow)
  const columnName = cellEl.dataset.dwCol
  if (!Number.isFinite(rowIndex) || !columnName) return null
  const entry = resolveRowEntry(rowIndex)
  if (!entry) return null
  const column = props.displayColumns.find((col) => col.name === columnName)
  if (!column) return null
  return {item: entry.item, rowIndex, column, columnName, cellEl}
}

function resolveIndexFromEvent(event: Event): {item: GridDisplayRow; rowIndex: number} | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  const indexEl = target.closest('td.index-col[data-dw-row]') as HTMLElement | null
  if (!indexEl) return null
  const rowIndex = Number(indexEl.dataset.dwRow)
  if (!Number.isFinite(rowIndex)) return null
  const entry = resolveRowEntry(rowIndex)
  if (!entry) return null
  return {item: entry.item, rowIndex}
}

function onBodyMouseDown(event: MouseEvent) {
  // 先挡原生选区，避免 Shift 拖出系统白框（再交给上层做单元格选区）
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    event.preventDefault()
  }
  const resolved = resolveCellFromEvent(event)
  if (!resolved) return
  emit('cellMouseDown', event, resolved.item, resolved.columnName, resolved.rowIndex)
}

function onBodyMouseUp(event: MouseEvent) {
  if (!(event.target instanceof Element)) return
  if (event.target.closest('td[data-dw-row][data-dw-col]')) {
    emit('cellMouseUp', event)
  }
}

function onBodyClick(event: MouseEvent) {
  const indexHit = resolveIndexFromEvent(event)
  if (indexHit) {
    emit('indexColClick', indexHit.item, indexHit.rowIndex, event)
    return
  }
  const resolved = resolveCellFromEvent(event)
  if (!resolved) return
  emit('cellClick', event, resolved.item, resolved.columnName)
}

function onBodyDblClick(event: MouseEvent) {
  const resolved = resolveCellFromEvent(event)
  if (!resolved) return
  emit('cellDblClick', resolved.item, resolved.columnName, event, resolved.rowIndex)
}

function onBodyContextMenu(event: MouseEvent) {
  const resolved = resolveCellFromEvent(event)
  if (!resolved) return
  emit('cellContextMenu', event, resolved.item, resolved.column)
}

/** mouseover/out bubble; mouseenter/leave do not — needed for hover preview without per-cell listeners. */
function onBodyMouseOver(event: MouseEvent) {
  const resolved = resolveCellFromEvent(event)
  if (!resolved) return
  const related = event.relatedTarget
  if (related instanceof Node && resolved.cellEl.contains(related)) return
  emit('cellMouseEnter', event, resolved.item, resolved.column)
}

function onBodyMouseOut(event: MouseEvent) {
  const resolved = resolveCellFromEvent(event)
  if (!resolved) return
  const related = event.relatedTarget
  if (related instanceof Node && resolved.cellEl.contains(related)) return
  emit('cellMouseLeave', resolved.item, resolved.column)
}
</script>

<template>
  <div
      class="dw-data-grid-table"
      @selectstart="onTableSelectStart"
  >
    <table
        class="grid-table"
        :class="{ 'is-resizing': resizingKey }"
        :style="{ width: `${tableMinWidthPx}px` }"
    >
      <colgroup>
        <col
            class="col-index"
            :style="{
              width: `${GRID_INDEX_COL_WIDTH_PX}px`,
              minWidth: `${GRID_INDEX_COL_WIDTH_PX}px`,
              maxWidth: `${GRID_INDEX_COL_WIDTH_PX}px`,
            }"
        />
        <template v-for="slot in columnSlots" :key="slot.key">
          <col
              v-if="slot.kind === 'pad'"
              class="col-virtual-pad"
              :style="{ width: `${slot.width}px`, minWidth: `${slot.width}px` }"
          />
          <col
              v-else
              class="col-data"
              :class="{
                'is-pinned': isColumnPinned?.(columnRowKey(slot.column)),
                'is-pinned-right': isColumnPinnedRight?.(columnRowKey(slot.column)),
              }"
              :style="columnColStyle(columnRowKey(slot.column))"
          />
        </template>
      </colgroup>
      <thead>
      <tr>
        <th class="index-col th--meta">#</th>
        <template v-for="slot in columnSlots" :key="slot.key">
          <th
              v-if="slot.kind === 'pad'"
              class="th--meta th--virtual-pad"
              aria-hidden="true"
              :style="{ width: `${slot.width}px`, minWidth: `${slot.width}px`, padding: 0, border: 'none' }"
          />
          <th
              v-else
              class="th--meta"
              :class="{
                'is-sortable': columnFiltersEnabled,
                'is-sorted': sortColumn === columnRowKey(slot.column) || Boolean(sortDirection(columnRowKey(slot.column))),
                'is-stats-active': statsColumnName === slot.column.name,
                'is-numeric': isNumericColumn(slot.column),
                'is-drag-over': dragOverKey === columnRowKey(slot.column) && dragFromKey !== columnRowKey(slot.column),
                'is-dragging': dragFromKey === columnRowKey(slot.column),
                'is-pinned': isColumnPinned?.(columnRowKey(slot.column)),
                'is-pinned-right': isColumnPinnedRight?.(columnRowKey(slot.column)),
                [`is-type-${columnTypeKind?.(slot.column) ?? 'other'}`]: typeColoring,
              }"
              :style="columnColStyle(columnRowKey(slot.column))"
              draggable="true"
              @click="emit('headerClick', $event, slot.column)"
              @contextmenu="emit('headerContextMenu', $event, slot.column)"
              @dragstart="emit('headerDragStart', $event, slot.column)"
              @dragover="emit('headerDragOver', $event, slot.column)"
              @drop="emit('headerDrop', $event, slot.column)"
              @dragend="emit('headerDragEnd')"
          >
            <div class="th-main">
              <DwIcon
                  v-if="isPrimaryKeyColumn(slot.column)"
                  class="th-key"
                  name="key"
                  size="xs"
                  :stroke-width="1.75"
              />
              <DwIcon
                  v-else
                  class="th-col-icon"
                  name="table"
                  size="xs"
                  :stroke-width="1.6"
              />
              <span class="th-label">{{ slot.column.name }}</span>
              <DwIcon
                  v-if="sortDirection(columnRowKey(slot.column))"
                  class="th-sort"
                  :class="{ 'th-sort--asc': sortDirection(columnRowKey(slot.column)) === 'asc' }"
                  name="chevron-down"
                  size="xs"
                  :stroke-width="2"
              />
            </div>
            <div v-if="columnTypeLabel(slot.column)" class="th-type">{{ columnTypeLabel(slot.column) }}</div>
            <div
                v-if="columnCommentLabel?.(slot.column)"
                class="th-comment"
                :title="columnCommentLabel?.(slot.column) || undefined"
            >{{ columnCommentLabel?.(slot.column) }}</div>
            <span
                class="th-resize"
                title=""
                @mousedown="emit('resizeStart', $event, slot.column)"
                @dblclick.stop="emit('resizeDblClick', $event, slot.column)"
                @click.stop
                @dragstart.stop.prevent
            />
          </th>
        </template>
      </tr>
      </thead>
      <tbody
          @mousedown="onBodyMouseDown"
          @mouseup="onBodyMouseUp"
          @click="onBodyClick"
          @dblclick="onBodyDblClick"
          @contextmenu="onBodyContextMenu"
          @mouseover="onBodyMouseOver"
          @mouseout="onBodyMouseOut"
      >
      <tr v-if="useVirtual && virtualPaddingTop > 0" class="grid-virtual-spacer" aria-hidden="true">
        <td :colspan="tableColumnCount" :style="{ height: `${virtualPaddingTop}px`, padding: 0, border: 'none' }"/>
      </tr>
      <tr
          v-for="{ item, index: rowIndex } in virtualRows"
          :key="rowIndex"
          :class="{
            'is-zebra': (rowOffset + rowIndex) % 2 === 1,
            'is-selected': isRowSelected(item) || Boolean(isRowMultiSelected?.(item)),
            'is-modified': isRowModified(item),
            'is-insert-row': item.kind === 'insert',
            'is-pending-delete': isRowPendingDelete(item),
            'is-selectable-row': inlineEnabled || enableRowDocumentView,
          }"
      >
        <td
            class="index-col"
            :class="{ 'index-col--selectable': inlineEnabled || enableRowDocumentView }"
            :data-dw-row="rowIndex"
            :title="enableRowDocumentView ? indexColSelectableTitle : undefined"
        >
          {{ rowOffset + rowIndex + 1 }}
        </td>
        <template v-for="slot in columnSlots" :key="slot.key">
          <td
              v-if="slot.kind === 'pad'"
              class="data-cell data-cell--virtual-pad"
              aria-hidden="true"
              :style="{ width: `${slot.width}px`, minWidth: `${slot.width}px`, padding: 0, border: 'none' }"
          />
          <td
              v-else
              class="data-cell"
              :data-dw-row="rowIndex"
              :data-dw-col="slot.column.name"
              :class="{
                'is-cell-active': isCellActive(item, slot.column.name) && item.kind !== 'insert',
                'is-cell-editing': isCellInputVisible(item, slot.column.name),
                'is-cell-range': isCellInRange?.(item, slot.column.name),
                'is-numeric': isNumericColumn(slot.column),
                'is-pinned': isColumnPinned?.(columnRowKey(slot.column)),
                'is-pinned-right': isColumnPinnedRight?.(columnRowKey(slot.column)),
                [`is-type-${columnTypeKind?.(slot.column) ?? 'other'}`]: typeColoring,
              }"
              :style="columnColStyle(columnRowKey(slot.column))"
              tabindex="-1"
          >
            <div
                class="cell-shell"
                :class="{ 'has-datetime': showDateTimeIcon(item, slot.column) }"
            >
              <DwGridCellText
                  :text="cellBackingText(item, slot.column.name)"
                  :is-null="!getCellDisplayText(item, slot.column.name) && item.kind !== 'insert'"
                  :backing="isCellInputVisible(item, slot.column.name)"
                  :wrap="wrapCells"
              />
              <input
                  v-if="isCellInputVisible(item, slot.column.name)"
                  :ref="(el) => bindEditingInput(el, item, slot.column.name)"
                  class="cell-input"
                  :class="{ 'cell-input--datetime': showDateTimeIcon(item, slot.column) }"
                  type="text"
                  :value="getCellDisplayText(item, slot.column.name)"
                  @input="emit('cellInput', item, slot.column.name, ($event.target as HTMLInputElement).value)"
                  @keydown.enter="emit('cellKeydownEnter', $event)"
                  @blur="emit('cellInputBlur', item)"
                  @focus="emit('cellInputFocus', item, slot.column.name)"
                  @click.stop
              />
              <button
                  v-if="showDateTimeIcon(item, slot.column)"
                  class="cell-datetime-btn"
                  type="button"
                  :class="{ 'is-open': isDatePickerOpen(item, slot.column.name) }"
                  :title="dateTimePickerTitle"
                  :aria-label="dateTimePickerTitle"
                  @mousedown.prevent="emit('dateTimeIconClick', item, slot.column.name)"
                  @click.stop
              >
                <DwIcon name="calendar" size="xs" :stroke-width="1.5"/>
              </button>
            </div>
          </td>
        </template>
      </tr>
      <tr v-if="useVirtual && virtualPaddingBottom > 0" class="grid-virtual-spacer" aria-hidden="true">
        <td :colspan="tableColumnCount" :style="{ height: `${virtualPaddingBottom}px`, padding: 0, border: 'none' }"/>
      </tr>
      </tbody>
    </table>
  </div>
</template>
