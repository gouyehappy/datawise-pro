import {computed, ref, watch, type MaybeRefOrGetter, toValue, type Ref} from 'vue'
import {useDebouncedRef} from '../utils/debounced-ref'
import {minGridPageSizeOption} from '../utils/grid-pagination'

const GRID_FILTER_DEBOUNCE_MS = 180

export function useDwDataGridState<T>(options: {
    rows: Ref<readonly T[]>
    resolveRowKey: (row: T) => string
    filter: Ref<string>
    filterColumn?: Ref<string>
    filterPredicate: (row: T, query: string) => boolean
    selectable: Ref<boolean>
    selectedKeys: Ref<string[]>
    defaultPageSize: MaybeRefOrGetter<string>
    pageSizeOptions: readonly string[]
}) {
    const pageSizeModel = ref(toValue(options.defaultPageSize))
    const currentPage = ref(1)
    const debouncedFilter = useDebouncedRef(options.filter, GRID_FILTER_DEBOUNCE_MS)

    const pageSize = computed(() => {
        const parsed = Number(pageSizeModel.value)
        if (Number.isFinite(parsed) && parsed > 0) return parsed
        return Number(minGridPageSizeOption(options.pageSizeOptions))
    })

    const filteredRows = computed(() => {
        const query = debouncedFilter.value
        if (!query.trim()) return options.rows.value
        return options.rows.value.filter((row) => options.filterPredicate(row, query))
    })

    const totalCount = computed(() => filteredRows.value.length)
    const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
    const canGoPrev = computed(() => currentPage.value > 1)
    const canGoNext = computed(() => currentPage.value < totalPages.value)

    const pagedRows = computed(() => {
        const start = (currentPage.value - 1) * pageSize.value
        return filteredRows.value.slice(start, start + pageSize.value)
    })

    const selectedSet = computed(() => new Set(options.selectedKeys.value))

    const allPageSelected = computed(() =>
        options.selectable.value
        && pagedRows.value.length > 0
        && pagedRows.value.every((row) => selectedSet.value.has(options.resolveRowKey(row))),
    )

    const somePageSelected = computed(() =>
        options.selectable.value
        && pagedRows.value.some((row) => selectedSet.value.has(options.resolveRowKey(row))),
    )

    watch([debouncedFilter, pageSize], () => {
        currentPage.value = 1
    })

    watch(
        () => options.filterColumn?.value,
        () => {
            if (!options.filterColumn) return
            currentPage.value = 1
        },
    )

    watch(totalPages, (nextTotal) => {
        if (currentPage.value > nextTotal) {
            currentPage.value = nextTotal
        }
    })

    watch(options.rows, () => {
        const valid = new Set(options.rows.value.map((row) => options.resolveRowKey(row)))
        const pruned = options.selectedKeys.value.filter((key) => valid.has(key))
        if (pruned.length !== options.selectedKeys.value.length) {
            options.selectedKeys.value = pruned
        }
    })

    function goFirst() {
        currentPage.value = 1
    }

    function goPrev() {
        if (canGoPrev.value) currentPage.value -= 1
    }

    function goNext() {
        if (canGoNext.value) currentPage.value += 1
    }

    function goLast() {
        currentPage.value = totalPages.value
    }

    function toggleRowSelection(row: T, checked: boolean) {
        const key = options.resolveRowKey(row)
        const next = new Set(options.selectedKeys.value)
        if (checked) next.add(key)
        else next.delete(key)
        options.selectedKeys.value = [...next]
    }

    function togglePageSelection(checked: boolean) {
        const next = new Set(options.selectedKeys.value)
        for (const row of pagedRows.value) {
            const key = options.resolveRowKey(row)
            if (checked) next.add(key)
            else next.delete(key)
        }
        options.selectedKeys.value = [...next]
    }

    return {
        pageSizeModel,
        currentPage,
        pageSize,
        filteredRows,
        totalCount,
        totalPages,
        canGoPrev,
        canGoNext,
        pagedRows,
        selectedSet,
        allPageSelected,
        somePageSelected,
        goFirst,
        goPrev,
        goNext,
        goLast,
        toggleRowSelection,
        togglePageSelection,
    }
}

export function defaultDwDataGridFilter<T extends Record<string, unknown>>(row: T, query: string): boolean {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return true
    return Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(normalized))
}

export function columnKeyFilterPredicate<T extends object>(
    row: T,
    columnKey: string,
    query: string,
    format?: (row: T) => string,
): boolean {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return true
    const text = format ? format(row) : String((row as Record<string, unknown>)[columnKey] ?? '')
    return text.toLowerCase().includes(normalized)
}

export function resolveDwDataGridRowKey<T>(row: T, rowKey: keyof T & string | ((row: T) => string)): string {
    if (typeof rowKey === 'function') return rowKey(row)
    return String(row[rowKey] ?? '')
}
