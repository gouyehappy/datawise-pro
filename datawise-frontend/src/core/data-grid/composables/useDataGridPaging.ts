import {computed, onBeforeUnmount, shallowRef, watch, type Ref} from 'vue'
import type {TableColumn} from '@/core/types'
import type {GridViewState} from '@/core/data-grid/services/grid-view-state.service'
import {
    filterAndSortDisplayRows as filterAndSortDisplayRowsWithColumns,
} from '../services/grid-display-rows.service'
import type {GridDisplayRow} from '../edit/useGridPendingEdit'
import {
    computeDisplayTotal,
    computePagedRowIds,
    computePagedRows,
    computeRowOffset,
    computeTotalPages,
    resolveFormViewCanNext,
    resolveFormViewCanPrev,
    resolveFormViewRow,
    resolveFormViewRowIndex,
    resolveFormViewRowNumber,
    resolveFormViewRowTotal,
    resolveNextFormViewTarget,
    toggleLayoutMode as toggleLayoutModeForGrid,
} from '../services/grid-pagination.service'
import {resolveGridPageSizeOption} from '@/shared/config/grid-pagination'
import {readStoredEditorSettings} from '@/shared/config/editor-settings-storage'
import {CURSOR_LOADED_ROWS_WARN_THRESHOLD} from '@/shared/config/query-result-limits'

/** Debounce text filters so each keystroke does not re-scan the full loaded set. */
const FILTER_DEBOUNCE_MS = 150

export interface DataGridPagingDeps {
    pageSizeModel: Ref<string>
    pageSizeOptions: readonly string[]
    viewState: Ref<GridViewState | undefined>
    columnFiltersEnabled: Ref<boolean>
    displayRows: Ref<GridDisplayRow[]>
    gridColumns: Ref<TableColumn[]>
    currentPage: Ref<number>
    layoutMode: Ref<'grid' | 'form'>
    selectedRowId: Ref<string | null>
    getCellDisplayText: (item: GridDisplayRow, columnName: string) => string
    /** 已加载行数（滑动窗口丢弃前），用于「已加载过多」提示 */
    loadedRowCount: () => number
    /** 滑动窗口已丢弃的最旧行数 */
    cursorTrimmedRows: () => number
    selectRow: (row: GridDisplayRow) => void
}

/**
 * 结果网格的分页 / 过滤 / 表单视图状态。
 *
 * 抽离自 `DataGrid.vue`，行为与抽取前逐行一致：过滤走 150ms 防抖，
 * 分页基于防抖后的过滤结果计算，表单视图复用同一份过滤结果。
 */
export function useDataGridPaging(deps: DataGridPagingDeps) {
    const {
        pageSizeModel,
        pageSizeOptions,
        viewState,
        columnFiltersEnabled,
        displayRows,
        gridColumns,
        currentPage,
        layoutMode,
        selectedRowId,
        getCellDisplayText,
        loadedRowCount,
        cursorTrimmedRows,
        selectRow,
    } = deps

    const pageSize = computed(() => {
        const parsed = Number(pageSizeModel.value)
        if (Number.isFinite(parsed) && parsed > 0) return parsed
        return Number(
            resolveGridPageSizeOption(
                pageSizeOptions,
                readStoredEditorSettings().defaultGridPageSize,
            ),
        )
    })

    function filterAndSortDisplayRows(rows: GridDisplayRow[], state: GridViewState): GridDisplayRow[] {
        return filterAndSortDisplayRowsWithColumns(rows, gridColumns.value, state, getCellDisplayText)
    }

    const debouncedFilterView = shallowRef<{
        whereExpression: string
        columnFilters: Record<string, string>
    } | null>(null)
    let filterDebounceTimer: ReturnType<typeof setTimeout> | null = null

    watch(
        () => {
            const state = viewState.value
            if (!state) return null
            return {
                whereExpression: state.whereExpression ?? '',
                columnFilters: state.columnFilters,
            }
        },
        (next) => {
            if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
            if (!next) {
                debouncedFilterView.value = null
                return
            }
            filterDebounceTimer = setTimeout(() => {
                debouncedFilterView.value = {
                    whereExpression: next.whereExpression,
                    columnFilters: {...next.columnFilters},
                }
                filterDebounceTimer = null
            }, FILTER_DEBOUNCE_MS)
        },
        {deep: true, immediate: true},
    )

    onBeforeUnmount(() => {
        if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
    })

    const viewFilteredDisplayRows = computed(() => {
        if (!columnFiltersEnabled.value || !viewState.value) return displayRows.value
        const filters = debouncedFilterView.value
        const stateForFilter: GridViewState = {
            ...viewState.value,
            whereExpression: filters?.whereExpression ?? viewState.value.whereExpression,
            columnFilters: filters?.columnFilters ?? viewState.value.columnFilters,
        }
        return filterAndSortDisplayRows(displayRows.value, stateForFilter)
    })

    const totalPages = computed(() =>
        computeTotalPages(viewFilteredDisplayRows.value.length, pageSize.value),
    )

    const displayTotal = computed(() =>
        computeDisplayTotal(viewFilteredDisplayRows.value.length),
    )

    const loadedRowsWarning = computed(
        () => loadedRowCount() >= CURSOR_LOADED_ROWS_WARN_THRESHOLD,
    )

    const cursorWindowTrimmed = computed(() => cursorTrimmedRows() > 0)

    const pagedRows = computed(() =>
        computePagedRows(viewFilteredDisplayRows.value, currentPage.value, pageSize.value),
    )

    const pagedRowIds = computed(() => computePagedRowIds(pagedRows.value))

    const rowOffset = computed(() =>
        computeRowOffset(cursorTrimmedRows(), currentPage.value, pageSize.value),
    )

    const formViewRow = computed(() =>
        resolveFormViewRow(viewFilteredDisplayRows.value, selectedRowId.value),
    )

    /** 在过滤后的全量行中的下标（跨页） */
    const formViewRowIndex = computed(() =>
        resolveFormViewRowIndex(viewFilteredDisplayRows.value, formViewRow.value),
    )

    const formViewRowNumber = computed(() =>
        resolveFormViewRowNumber(formViewRowIndex.value, cursorTrimmedRows()),
    )

    const formViewRowTotal = computed(() =>
        resolveFormViewRowTotal(viewFilteredDisplayRows.value, cursorTrimmedRows()),
    )

    const formViewCanPrev = computed(() => resolveFormViewCanPrev(formViewRowIndex.value))
    const formViewCanNext = computed(() =>
        resolveFormViewCanNext(formViewRowIndex.value, viewFilteredDisplayRows.value),
    )

    function selectFormViewRowByOffset(delta: number) {
        const rows = viewFilteredDisplayRows.value
        if (!rows.length) return
        const currentIndex = formViewRowIndex.value >= 0 ? formViewRowIndex.value : 0
        const target = resolveNextFormViewTarget(rows, currentIndex, delta, pageSize.value)
        if (!target.row) return
        if (currentPage.value !== target.page) {
            currentPage.value = target.page
        }
        selectRow(target.row)
    }

    function toggleLayoutMode() {
        layoutMode.value = toggleLayoutModeForGrid(layoutMode.value)
        if (layoutMode.value === 'form' && formViewRow.value) {
            selectRow(formViewRow.value)
        }
    }

    return {
        pageSize,
        viewFilteredDisplayRows,
        totalPages,
        displayTotal,
        loadedRowsWarning,
        cursorWindowTrimmed,
        pagedRows,
        pagedRowIds,
        rowOffset,
        formViewRow,
        formViewRowIndex,
        formViewRowNumber,
        formViewRowTotal,
        formViewCanPrev,
        formViewCanNext,
        selectFormViewRowByOffset,
        toggleLayoutMode,
    }
}
