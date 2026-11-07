<!--
  Host product shell — vue-i18n + editor-presets wired onto package DwDataGrid.
-->
<script setup lang="ts" generic="T extends object">
/**
 * Thin host wrapper around `@datawise/data-grid` DwDataGrid.
 * Keeps public props / v-models / slots stable for product callers.
 */
import {computed, useSlots} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  DwDataGrid as PackageDwDataGrid,
  type DwDataGridColumn,
  type DwDataGridLabels,
  type DwDataGridRowKey,
} from '@datawise/data-grid'
import type {SelectOption} from '@/core/components/select.types'
import {GRID_PAGE_SIZE_OPTIONS} from '@/shared/config/editor-presets'
import {readStoredEditorSettings} from '@/shared/config/editor-settings-storage'

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
  pageSizeOptions: () => GRID_PAGE_SIZE_OPTIONS.map(String),
})

const selectedKeys = defineModel<string[]>('selectedKeys', {default: () => []})
const filter = defineModel<string>('filter', {default: ''})
const filterColumn = defineModel<string>('filterColumn', {default: ''})
const currentPage = defineModel<number>('currentPage')
const pageSize = defineModel<string>('pageSize')

const slots = useSlots()
const {t} = useI18n()

/** Package interpolates `{count}` in `total`; keep the placeholder from i18n. */
const resolvedLabels = computed<Partial<DwDataGridLabels>>(() => ({
  filter: t('dataGrid.filterPlaceholder'),
  filterValue: t('dataGrid.filterValuePlaceholder'),
  total: t('dataGrid.shellTotal', {count: '{count}'}),
  firstPage: t('dataGrid.firstPage'),
  prevPage: t('dataGrid.prevPage'),
  nextPage: t('dataGrid.nextPage'),
  lastPage: t('dataGrid.lastPage'),
  empty: t('dataGrid.shellEmpty'),
  noMatch: t('dataGrid.shellNoMatch'),
  loading: t('dataGrid.shellLoading'),
  clearFilterInput: t('dataGrid.clearFilterInput'),
  ...props.labels,
}))

function defaultPageSizeGetter(): number | null | undefined {
  return readStoredEditorSettings().defaultGridPageSize
}
</script>

<template>
  <PackageDwDataGrid
      v-bind="props"
      v-model:selected-keys="selectedKeys"
      v-model:filter="filter"
      v-model:filter-column="filterColumn"
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      :labels="resolvedLabels"
      :default-page-size-getter="defaultPageSizeGetter"
  >
    <template v-for="(_, name) in slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData ?? {}"/>
    </template>
  </PackageDwDataGrid>
</template>
