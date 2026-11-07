export type DwDataGridAlign = 'left' | 'right' | 'center'

export interface DwDataGridColumn<T = Record<string, unknown>> {
    /** 行对象字段名 */
    key: string
    label: string
    width?: string
    align?: DwDataGridAlign
    headerClass?: string
    cellClass?: string
    mono?: boolean
    format?: (row: T) => string
}

export interface DwDataGridLabels {
    filter: string
    filterValue?: string
    total: string
    firstPage: string
    prevPage: string
    nextPage: string
    lastPage: string
    empty: string
    noMatch: string
    loading: string
    clearFilterInput?: string
}

/** English fallbacks when host does not pass `labels`. */
export const DEFAULT_DW_DATA_GRID_LABELS: DwDataGridLabels = {
    filter: 'Search…',
    filterValue: 'Type to filter…',
    total: 'Total: {count}',
    firstPage: 'First page',
    prevPage: 'Previous page',
    nextPage: 'Next page',
    lastPage: 'Last page',
    empty: 'No data',
    noMatch: 'No matches',
    loading: 'Loading…',
    clearFilterInput: 'Clear input',
}

export type DwDataGridRowKey<T> = keyof T & string | ((row: T) => string)
