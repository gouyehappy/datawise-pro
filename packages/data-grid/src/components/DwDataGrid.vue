<!-- Presentational shell for @datawise/data-grid. Host keeps a product-wired copy until cutover. -->
<script setup lang="ts" generic="T extends object">
/**
 * Package DwDataGrid — labels / pageSizeOptions / optional defaultPageSizeGetter.
 * Host copy may wire vue-i18n + editor-presets; this file stays OpenAPI/i18n-free.
 */
import {computed, ref, toRef, useSlots, watch} from 'vue'
import {
  DwCheckbox,
  DwPanelState,
  DwSelect,
  EmptyState,
  PillSelect,
  type SelectOption,
} from '@datawise/ui'
import {DwIcon} from '@datawise/icons'
import {
  DEFAULT_DW_DATA_GRID_LABELS,
  type DwDataGridColumn,
  type DwDataGridLabels,
  type DwDataGridRowKey,
} from './dw-data-grid.types'
import {
  columnKeyFilterPredicate,
  defaultDwDataGridFilter,
  resolveDwDataGridRowKey,
  useDwDataGridState,
} from './useDwDataGridState'
import {useGridVirtualWindow} from '../useGridVirtualWindow'
import {
  DEFAULT_GRID_PAGE_SIZE_OPTIONS,
  minGridPageSizeOption,
  resolveGridPageSizeOption,
} from '../utils/grid-pagination'

const props = withDefaults(defineProps<{
  rows: T[]
  columns: DwDataGridColumn<T>[]
  rowKey?: DwDataGridRowKey<T>
  loading?: boolean
  error?: string | null
  labels?: Partial<DwDataGridLabels>
  selectable?: boolean
  showSearch?: boolean
  showPagination?: boolean
  /** 搜索框前显示列选择，仅搜索选中列 */
  columnFilter?: boolean
  /** 列筛选选项；默认从 columns 推导 */
  filterColumnOptions?: SelectOption[]
  /** 仅渲染工具栏壳层，表格等内容通过 #body 插槽注入 */
  shellOnly?: boolean
  /** shellOnly 时由父组件提供总行数 */
  totalCount?: number
  filterPredicate?: (row: T, query: string) => boolean
  defaultPageSize?: string
  /** Host may pass editor-settings reader; package never imports host storage. */
  defaultPageSizeGetter?: () => number | null | undefined
  pageSizeOptions?: string[]
}>(), {
  rowKey: undefined,
  loading: false,
  error: null,
  selectable: true,
  showSearch: true,
  showPagination: true,
  columnFilter: false,
  filterColumnOptions: undefined,
  shellOnly: false,
  totalCount: undefined,
  filterPredicate: undefined,
  defaultPageSize: undefined,
  defaultPageSizeGetter: undefined,
  pageSizeOptions: () => DEFAULT_GRID_PAGE_SIZE_OPTIONS.map(String),
})

const selectedKeys = defineModel<string[]>('selectedKeys', {default: () => []})
const filter = defineModel<string>('filter', {default: ''})
const filterColumn = defineModel<string>('filterColumn', {default: ''})
const currentPageModel = defineModel<number>('currentPage')
const pageSizeModelBinding = defineModel<string>('pageSize')

const slots = useSlots()

const hasToolbarActions = computed(() => Boolean(slots['toolbar-actions']))
const hasToolbarEnd = computed(() => Boolean(slots['toolbar-end']))
const hasBodySlot = computed(() => Boolean(slots.body))
const hasEmptySlot = computed(() => Boolean(slots.empty))

const resolveRowKey = (row: T) => {
  const key = props.rowKey ?? ('id' as keyof T & string)
  return resolveDwDataGridRowKey(row, key)
}

const rowsRef = computed(() => props.rows)
const selectableRef = computed(() => props.selectable)
const filterColumnRef = computed(() => filterColumn.value)

const filterColumnSelectOptions = computed<SelectOption[]>(() => {
  if (props.filterColumnOptions?.length) return props.filterColumnOptions
  return props.columns.map((column) => ({
    value: column.key,
    label: column.label || column.key,
  }))
})

watch(
    filterColumnSelectOptions,
    (options) => {
      if (!props.columnFilter) return
      if (!options.length) {
        filterColumn.value = ''
        return
      }
      if (!filterColumn.value || !options.some((option) => option.value === filterColumn.value)) {
        filterColumn.value = options[0].value
      }
    },
    {immediate: true},
)

function resolveFilterPredicate(row: T, query: string): boolean {
  if (props.filterPredicate) return props.filterPredicate(row, query)
  if (props.columnFilter && filterColumn.value) {
    const column = props.columns.find((entry) => entry.key === filterColumn.value)
    return columnKeyFilterPredicate(row, filterColumn.value, query, column?.format)
  }
  return (defaultDwDataGridFilter as (row: T, query: string) => boolean)(row, query)
}

const effectiveDefaultPageSize = computed(() =>
    props.defaultPageSize
        ?? resolveGridPageSizeOption(
            props.pageSizeOptions,
            props.defaultPageSizeGetter?.() ?? null,
        ),
)

const gridState = useDwDataGridState<T>({
  rows: rowsRef,
  resolveRowKey,
  filter,
  filterColumn: filterColumnRef,
  filterPredicate: resolveFilterPredicate,
  selectable: selectableRef,
  selectedKeys,
  defaultPageSize: effectiveDefaultPageSize,
  pageSizeOptions: props.pageSizeOptions,
})

const {
  pageSizeModel: internalPageSizeModel,
  currentPage: internalCurrentPage,
  canGoPrev: internalCanGoPrev,
  canGoNext: internalCanGoNext,
  pagedRows,
  selectedSet,
  allPageSelected,
  somePageSelected,
  totalCount: internalTotalCount,
  goFirst: internalGoFirst,
  goPrev: internalGoPrev,
  goNext: internalGoNext,
  goLast: internalGoLast,
  toggleRowSelection,
  togglePageSelection,
} = gridState

const shellPageSize = computed(() => {
  const raw = pageSizeModelBinding.value ?? effectiveDefaultPageSize.value
  const parsed = Number(raw)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return Number(minGridPageSizeOption(props.pageSizeOptions))
})

const shellTotalCount = computed(() => props.totalCount ?? 0)
const shellTotalPages = computed(() => Math.max(1, Math.ceil(shellTotalCount.value / shellPageSize.value)))

const pageSizeModel = computed({
  get: () => (props.shellOnly ? (pageSizeModelBinding.value ?? effectiveDefaultPageSize.value) : internalPageSizeModel.value),
  set: (value: string) => {
    if (props.shellOnly) pageSizeModelBinding.value = value
    else internalPageSizeModel.value = value
  },
})

const currentPage = computed({
  get: () => (props.shellOnly ? (currentPageModel.value ?? 1) : internalCurrentPage.value),
  set: (value: number) => {
    if (props.shellOnly) currentPageModel.value = value
    else internalCurrentPage.value = value
  },
})

const canGoPrev = computed(() => (props.shellOnly ? currentPage.value > 1 : internalCanGoPrev.value))
const canGoNext = computed(() => (
    props.shellOnly ? currentPage.value < shellTotalPages.value : internalCanGoNext.value
))

const effectiveTotalCount = computed(() => (
    props.shellOnly ? shellTotalCount.value : internalTotalCount.value
))

function goFirst() {
  if (props.shellOnly) currentPage.value = 1
  else internalGoFirst()
}

function goPrev() {
  if (props.shellOnly) {
    if (canGoPrev.value) currentPage.value -= 1
    return
  }
  internalGoPrev()
}

function goNext() {
  if (props.shellOnly) {
    if (canGoNext.value) currentPage.value += 1
    return
  }
  internalGoNext()
}

function goLast() {
  if (props.shellOnly) currentPage.value = shellTotalPages.value
  else internalGoLast()
}

watch(shellTotalPages, (pages) => {
  if (!props.shellOnly) return
  if (currentPage.value > pages) currentPage.value = pages
})

const labels = computed<DwDataGridLabels>(() => {
  const merged: DwDataGridLabels = {
    ...DEFAULT_DW_DATA_GRID_LABELS,
    ...props.labels,
  }
  const totalTemplate = props.labels?.total ?? DEFAULT_DW_DATA_GRID_LABELS.total
  return {
    ...merged,
    total: totalTemplate.replace(/\{count\}/g, String(effectiveTotalCount.value)),
  }
})

const searchPlaceholder = computed(() => (
    props.columnFilter ? (labels.value.filterValue ?? labels.value.filter) : labels.value.filter
))

const hasActiveFilter = computed(() => Boolean(filter.value.trim()))

const filterColumnMenuMinWidth = computed(() => {
  const labels = filterColumnSelectOptions.value.map((option) => option.label)
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0)
  return `${Math.min(320, Math.max(168, longest * 9 + 56))}px`
})

function formatCellValue(row: T, column: DwDataGridColumn<T>): string {
  if (column.format) return column.format(row)
  const raw = row[column.key as keyof T]
  if (raw == null || raw === '') return '—'
  return String(raw)
}

function headerClass(column: DwDataGridColumn<T>): string[] {
  return [
    column.headerClass ?? '',
    column.align === 'right' ? 'is-right' : '',
    column.align === 'center' ? 'is-center' : '',
  ].filter(Boolean)
}

function cellClass(column: DwDataGridColumn<T>): string[] {
  return [
    column.cellClass ?? '',
    column.align === 'right' ? 'is-right' : '',
    column.align === 'center' ? 'is-center' : '',
    column.mono ? 'is-mono' : '',
  ].filter(Boolean)
}

const columnCount = computed(() => props.columns.length + (props.selectable ? 1 : 0))

const gridBodyRef = ref<HTMLElement | null>(null)
const pagedRowsRef = toRef(pagedRows)
const virtualEnabled = computed(() => !props.shellOnly)
const {
  useVirtual: useGridVirtual,
  visibleRows: virtualPagedRows,
  paddingTop: virtualPaddingTop,
  paddingBottom: virtualPaddingBottom,
} = useGridVirtualWindow(gridBodyRef, pagedRowsRef, {enabled: virtualEnabled})

watch(internalCurrentPage, () => {
  gridBodyRef.value?.scrollTo({top: 0})
})
</script>

<template>
  <div class="dw-data-grid">
    <div class="dw-data-grid__shell">
      <header class="dw-data-grid__head">
        <div v-if="showPagination || hasToolbarActions || hasToolbarEnd" class="dw-data-grid__toolbar">
          <div class="dw-data-grid__toolbar-left">
            <template v-if="showPagination">
              <div class="dw-step-nav dw-data-grid__pager" role="group" :aria-label="labels.prevPage">
                <button
                    class="dw-step-nav__btn"
                    type="button"
                    :title="labels.firstPage"
                    :disabled="!canGoPrev"
                    @click="goFirst"
                >
                  <DwIcon name="chevrons-left" size="sm" :stroke-width="2.25"/>
                </button>
                <button
                    class="dw-step-nav__btn"
                    type="button"
                    :title="labels.prevPage"
                    :disabled="!canGoPrev"
                    @click="goPrev"
                >
                  <DwIcon name="chevron-left" size="sm" :stroke-width="2.25"/>
                </button>
                <span class="dw-step-nav__current">{{ currentPage }}</span>
                <button
                    class="dw-step-nav__btn"
                    type="button"
                    :title="labels.nextPage"
                    :disabled="!canGoNext"
                    @click="goNext"
                >
                  <DwIcon name="chevron-right" size="sm" :stroke-width="2.25"/>
                </button>
                <button
                    class="dw-step-nav__btn dw-step-nav__btn--last"
                    type="button"
                    :title="labels.lastPage"
                    :disabled="!canGoNext"
                    @click="goLast"
                >
                  <DwIcon name="chevrons-right" size="sm" :stroke-width="2.25"/>
                </button>
              </div>
              <PillSelect
                  v-model="pageSizeModel"
                  class="dw-data-grid__page-size"
                  size="compact"
                  :options="pageSizeOptions"
                  menu-min-width="88px"
              />
              <span class="dw-data-grid__total">{{ labels.total }}</span>
            </template>

            <span v-if="showPagination && hasToolbarActions" class="dw-data-grid__toolbar-divider" aria-hidden="true"/>
            <slot name="toolbar-actions"/>
          </div>

          <div v-if="hasToolbarEnd" class="dw-data-grid__toolbar-right">
            <slot name="toolbar-end"/>
          </div>
        </div>

        <slot name="below-toolbar"/>

        <div v-if="showSearch" class="dw-data-grid__search-wrap" :class="{ 'is-column-filter': columnFilter }">
          <div
              v-if="columnFilter"
              class="dw-data-grid__search-combo"
              :class="{ 'is-active': hasActiveFilter }"
          >
            <div class="dw-data-grid__search-field dw-data-grid__search-field--column">
              <DwSelect
                  v-model="filterColumn"
                  size="inline"
                  :options="filterColumnSelectOptions"
                  :menu-min-width="filterColumnMenuMinWidth"
              />
            </div>
            <div class="dw-data-grid__search-field dw-data-grid__search-field--query">
              <DwIcon class="dw-data-grid__search-icon" name="search" size="sm" :stroke-width="1.5"/>
              <input
                  v-model="filter"
                  class="dw-data-grid__search dw-data-grid__search--combo"
                  type="search"
                  :placeholder="searchPlaceholder"
              >
              <button
                  v-if="hasActiveFilter"
                  class="dw-data-grid__search-clear"
                  type="button"
                  :title="labels.clearFilterInput ?? labels.filter"
                  @click="filter = ''"
              >
                <DwIcon name="x" size="xs" :stroke-width="1.6"/>
              </button>
            </div>
          </div>
          <template v-else>
            <DwIcon class="dw-data-grid__search-icon" name="search" size="sm" :stroke-width="1.5"/>
            <input
                v-model="filter"
                class="dw-data-grid__search"
                type="search"
                :placeholder="searchPlaceholder"
            >
          </template>
        </div>
      </header>

      <div v-if="shellOnly && hasBodySlot" class="dw-data-grid__body dw-data-grid__body--custom">
        <slot name="body"/>
      </div>
      <DwPanelState
          v-else-if="loading"
          status="loading"
          :message="labels.loading"
          fill
      />
      <DwPanelState
          v-else-if="error"
          status="error"
          :message="error"
          fill
      />
      <DwPanelState
          v-else-if="!rows.length"
          status="empty"
          :message="labels.empty"
          compact
          fill
      >
        <template v-if="hasEmptySlot" #empty>
          <slot name="empty"/>
        </template>
      </DwPanelState>
      <div v-else ref="gridBodyRef" class="dw-data-grid__body">
        <table class="dw-data-grid__table">
          <thead>
          <tr>
            <th v-if="selectable" class="col-check">
              <DwCheckbox
                  :model-value="allPageSelected"
                  :indeterminate="somePageSelected && !allPageSelected"
                  @update:model-value="togglePageSelection"
              />
            </th>
            <th
                v-for="column in columns"
                :key="column.key"
                :class="headerClass(column)"
                :style="column.width ? { width: column.width } : undefined"
            >
              <slot :name="`header-${column.key}`" :column="column">
                {{ column.label }}
              </slot>
            </th>
          </tr>
          </thead>
          <tbody>
          <tr v-if="useGridVirtual && virtualPaddingTop > 0" class="dw-data-grid__virtual-spacer" aria-hidden="true">
            <td :colspan="columnCount" :style="{ height: `${virtualPaddingTop}px`, padding: 0, border: 'none' }"/>
          </tr>
          <tr
              v-for="{ item: row } in virtualPagedRows"
              :key="resolveRowKey(row)"
              :class="{ 'is-selected': selectable && selectedSet.has(resolveRowKey(row)) }"
          >
            <td v-if="selectable" class="col-check">
              <DwCheckbox
                  :model-value="selectedSet.has(resolveRowKey(row))"
                  @update:model-value="toggleRowSelection(row, $event)"
              />
            </td>
            <td
                v-for="column in columns"
                :key="`${resolveRowKey(row)}-${column.key}`"
                :class="cellClass(column)"
                :style="column.width ? { width: column.width } : undefined"
            >
              <slot
                  :name="`cell-${column.key}`"
                  :row="row"
                  :column="column"
                  :value="formatCellValue(row, column)"
              >
                {{ formatCellValue(row, column) }}
              </slot>
            </td>
          </tr>
          <tr v-if="useGridVirtual && virtualPaddingBottom > 0" class="dw-data-grid__virtual-spacer" aria-hidden="true">
            <td :colspan="columnCount" :style="{ height: `${virtualPaddingBottom}px`, padding: 0, border: 'none' }"/>
          </tr>
          <tr v-if="!pagedRows.length">
            <td :colspan="columnCount">
              <slot name="no-match">
                <EmptyState embedded compact :title="labels.noMatch"/>
              </slot>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dw-data-grid {
  --ddg-shell-bg: var(--dw-bg-panel);
  --ddg-shell-border: var(--dw-panel-outline, var(--dw-panel-border));
  --ddg-head-bg: color-mix(in srgb, var(--dw-bg-muted) 18%, var(--dw-bg-panel));
  --ddg-table-head-bg: color-mix(in srgb, var(--dw-bg-muted) 22%, var(--dw-bg-panel));
  --ddg-row-hover: color-mix(in srgb, var(--dw-text) 5%, var(--dw-bg-panel));
  --ddg-row-selected: color-mix(in srgb, var(--dw-primary) 7%, var(--dw-bg-panel));
  --ddg-pad-x: 8px;
  --ddg-pad-y: 6px;

  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 0;
  background: var(--dw-bg-editor);
}

.dw-data-grid__shell {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--ddg-shell-border);
  background: var(--ddg-shell-bg);
  overflow: hidden;
}

.dw-data-grid__head {
  flex-shrink: 0;
  position: relative;
  z-index: var(--dw-z-raised);
  overflow: visible;
  background: var(--ddg-head-bg);
}

.dw-data-grid__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap-sm) var(--dw-gap);
  padding: var(--dw-space-2) var(--dw-space-4);
  border-bottom: 1px solid var(--dw-panel-outline, var(--dw-panel-border));
  container-type: inline-size;
  container-name: dw-data-grid-toolbar;
}

.dw-data-grid__toolbar-left,
.dw-data-grid__toolbar-right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-width: 0;
  max-width: 100%;
}

.dw-data-grid__toolbar-left {
  flex: 1 1 12rem;
}

.dw-data-grid__toolbar-right {
  flex: 1 1 auto;
  justify-content: flex-end;
}

@container dw-data-grid-toolbar (max-width: 720px) {
  .dw-data-grid__toolbar-left,
  .dw-data-grid__toolbar-right {
    flex-basis: 100%;
    justify-content: flex-start;
  }
}

.dw-data-grid__toolbar-divider {
  width: 1px;
  height: var(--dw-icon-size-lg);
  margin: 0 var(--dw-space-1);
  background: color-mix(in srgb, var(--dw-border-light) 28%, transparent);
}

.dw-data-grid__page-size {
  width: auto;
  flex-shrink: 0;
}

.dw-data-grid__total {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
  white-space: nowrap;
}

.dw-data-grid__toolbar-left :slotted(button),
.dw-data-grid__toolbar-right :slotted(button) {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  flex-shrink: 0;
  cursor: pointer;
  white-space: nowrap;
}

.dw-data-grid__toolbar-left :slotted(button:disabled),
.dw-data-grid__toolbar-right :slotted(button:disabled) {
  cursor: not-allowed;
}

.dw-data-grid__toolbar-right :slotted(.dw-data-grid__end-chip) {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  max-width: 220px;
  height: var(--dw-btn-height);
  padding: 0 var(--dw-space-4);
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--dw-bg-muted) 40%, transparent);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
}

.dw-data-grid__toolbar-right :slotted(.dw-data-grid__end-chip strong) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-text-primary);
  font-weight: 500;
}

.dw-data-grid__search-wrap {
  position: relative;
}

.dw-data-grid__search-wrap.is-column-filter {
  padding: 0;
}

.dw-data-grid__search-combo {
  display: flex;
  align-items: stretch;
  width: 100%;
  height: var(--dw-tab-height);
  border-top: none;
  background: color-mix(in srgb, var(--dw-bg-panel) 94%, var(--dw-bg-editor));
}

.dw-data-grid__search-combo.is-active {
  border-top-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border-light));
}

.dw-data-grid__search-combo:focus-within {
  border-top-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border-light));
}

.dw-data-grid__search-field {
  display: flex;
  align-items: center;
  height: var(--dw-tab-height);
  min-width: 0;
}

.dw-data-grid__search-field--column {
  flex: 0 1 auto;
  max-width: min(220px, 34vw);
  padding: 0 var(--dw-space-4) 0 var(--dw-space-5);
  border-right: none;
  background: color-mix(in srgb, var(--dw-bg-muted) 22%, transparent);
}

.dw-data-grid__search-field--column :deep(.dw-select) {
  width: auto;
  min-width: 72px;
  max-width: 100%;
  height: var(--dw-tab-height);
}

.dw-data-grid__search-field--column :deep(.dw-select__trigger) {
  display: inline-flex;
  align-items: center;
  width: 100%;
  height: var(--dw-tab-height);
  min-height: var(--dw-tab-height);
  padding: 0 18px 0 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-family: inherit;
  font-size: var(--dw-text-sm);
  font-weight: 500;
  line-height: 1;
  color: var(--dw-text-primary);
}

.dw-data-grid__search-field--column :deep(.dw-select__value) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: inherit;
  font-weight: 500;
}

.dw-data-grid__search-field--column :deep(.dw-select__chevron) {
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
}

.dw-data-grid__search-field--column :deep(.dw-select__trigger:hover:not(:disabled)),
.dw-data-grid__search-field--column :deep(.dw-select.is-open .dw-select__trigger) {
  background: transparent;
  box-shadow: none;
}

.dw-data-grid__search-field--column :deep(.dw-select__menu) {
  z-index: var(--dw-z-popover);
}

.dw-data-grid__search-field--query {
  flex: 1;
  gap: var(--dw-gap);
  padding: 0 var(--dw-space-4);
}

.dw-data-grid__search-combo.is-active .dw-data-grid__search-icon {
  color: var(--dw-primary);
}

.dw-data-grid__search-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  flex-shrink: 0;
  color: var(--dw-text-muted);
  pointer-events: none;
}

.dw-data-grid__search-wrap.is-column-filter .dw-data-grid__search-icon {
  position: static;
  transform: none;
}

.dw-data-grid__search {
  width: 100%;
  height: var(--dw-tab-height);
  padding: 0 var(--dw-space-4) 0 var(--dw-space-11);
  border: none;
  border-top: none;
  background: color-mix(in srgb, var(--dw-bg-panel) 94%, var(--dw-bg-editor));
  color: var(--dw-text-primary);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-tab-height);
}

.dw-data-grid__search--combo {
  flex: 1;
  min-width: 0;
  height: var(--dw-tab-height);
  padding: 0;
  border-top: none;
  background: transparent;
  line-height: var(--dw-tab-height);
}

.dw-data-grid__search--combo::-webkit-search-cancel-button {
  display: none;
}

.dw-data-grid__search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  margin-right: var(--dw-space-2);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
}

.dw-data-grid__search-clear:hover {
  color: var(--dw-text-secondary);
  background: color-mix(in srgb, var(--dw-bg-muted) 40%, transparent);
}

.dw-data-grid__search:focus {
  outline: none;
  border-top-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border-light));
}

.dw-data-grid__search-wrap:not(.is-column-filter) .dw-data-grid__search:focus {
  border-top-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border-light));
}

.dw-data-grid__page-size :deep(.dw-select__trigger) {
  border-radius: var(--dw-control-radius-sm);
  box-shadow: none;
  min-height: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  border-color: transparent;
  background: color-mix(in srgb, var(--dw-bg-muted) 40%, transparent);
  padding: 0 var(--dw-space-4);
}

.dw-data-grid__page-size :deep(.dw-select) {
  width: auto;
  min-width: 64px;
}

.dw-data-grid__page-size :deep(.dw-select__menu) {
  z-index: var(--dw-z-popover);
}

.dw-data-grid__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--ddg-shell-bg);
}

tr.dw-data-grid__virtual-spacer td {
  padding: 0 !important;
  border: none !important;
  line-height: 0;
  pointer-events: none;
}

.dw-data-grid__body--custom {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dw-data-grid__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dw-text-sm);
}

.dw-data-grid__table th,
.dw-data-grid__table td {
  padding: var(--ddg-pad-y) var(--ddg-pad-x);
  border-bottom: 1px solid color-mix(in srgb, var(--dw-border-light) 55%, transparent);
  text-align: left;
  vertical-align: middle;
}

.dw-data-grid__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--ddg-table-head-bg);
  color: var(--dw-text-secondary);
  font-weight: 600;
  white-space: nowrap;
}

.dw-data-grid__table th.is-right,
.dw-data-grid__table td.is-right {
  text-align: right;
}

.dw-data-grid__table th.is-center,
.dw-data-grid__table td.is-center {
  text-align: center;
}

.dw-data-grid__table td.is-mono {
  font-family: var(--dw-font-mono);
}

.dw-data-grid__table tbody tr:hover {
  background: var(--ddg-row-hover);
}

.dw-data-grid__table tbody tr.is-selected {
  background: var(--ddg-row-selected);
}

.col-check {
  width: 42px;
  text-align: center;
}

.col-check :deep(.dw-checkbox) {
  justify-content: center;
}

.col-check :deep(.dw-checkbox__control),
.col-check input[type='checkbox'] {
  width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
  accent-color: var(--dw-primary);
  cursor: pointer;
}

</style>
