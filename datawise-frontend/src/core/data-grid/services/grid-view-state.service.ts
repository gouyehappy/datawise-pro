import type {TableColumn, TableRow} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import {resolveGridColumnTypeLabel} from '@/core/data-grid/meta/column-meta'
import {formatCellFullValue} from '@/core/utils/cell-value-format'
import {columnRowKey, readRowCell} from '@/core/utils/query-result-column'
import {rowMatchesWhereExpression} from '@/core/data-grid/services/grid-where-expression.service'

export type GridSortDirection = 'asc' | 'desc'

export const GRID_COLUMN_WIDTH_DEFAULT = 148
export const GRID_COLUMN_WIDTH_MIN = 64
export const GRID_COLUMN_WIDTH_MAX = 720

/** 按字段类型 / 声明长度给出合理默认列宽（用户手动拖拽后以持久化宽度为准） */
export function suggestGridColumnWidth(
    column: TableColumn,
    details: TableColumnDetail[] = [],
): number {
    const typeLabel = resolveGridColumnTypeLabel(column, details).toLowerCase()
    const nameFloor = Math.min(
        220,
        Math.max(GRID_COLUMN_WIDTH_MIN, column.name.length * 8 + 44),
    )
    const declaredLen = parseDeclaredTypeLength(typeLabel)

    let suggested = GRID_COLUMN_WIDTH_DEFAULT
    if (/\b(bool|boolean|bit)\b/.test(typeLabel)) {
        suggested = 72
    } else if (/\btinyint\b/.test(typeLabel)) {
        suggested = 76
    } else if (/\b(smallint|year)\b/.test(typeLabel)) {
        suggested = 84
    } else if (/\b(bigint|bigserial)\b/.test(typeLabel)) {
        suggested = 108
    } else if (/\b(int|integer|serial|mediumint)\b/.test(typeLabel)) {
        suggested = 92
    } else if (/\b(float|double|real|money)\b/.test(typeLabel)) {
        suggested = 112
    } else if (/\b(decimal|numeric|number)\b/.test(typeLabel)) {
        suggested = declaredLen != null
            ? Math.min(168, Math.max(100, 90 + declaredLen * 7))
            : 120
    } else if (/\b(datetime|timestamp)/.test(typeLabel)) {
        suggested = declaredLen != null && declaredLen >= 3 ? 188 : 172
    } else if (/\bdate\b/.test(typeLabel) && !/\bdatetime\b/.test(typeLabel)) {
        suggested = 112
    } else if (/\btime\b/.test(typeLabel) && !/\bdatetime\b/.test(typeLabel) && !/\btimestamp\b/.test(typeLabel)) {
        suggested = 108
    } else if (/\b(uuid|uniqueidentifier|guid)\b/.test(typeLabel)) {
        suggested = 280
    } else if (/\b(json|jsonb|xml)\b/.test(typeLabel)) {
        suggested = 220
    } else if (/\b(longtext|mediumtext|tinytext|text|clob|nclob|blob|bytea)\b/.test(typeLabel)) {
        suggested = 200
    } else if (/\b(char|varchar|nvarchar|nchar|character varying|character)\b/.test(typeLabel)) {
        if (declaredLen == null) {
            suggested = 148
        } else if (declaredLen <= 8) {
            suggested = 88
        } else if (declaredLen <= 16) {
            suggested = 120
        } else if (declaredLen <= 32) {
            suggested = 148
        } else if (declaredLen <= 64) {
            suggested = 180
        } else if (declaredLen <= 128) {
            suggested = 220
        } else if (declaredLen <= 255) {
            suggested = 260
        } else {
            suggested = 280
        }
    } else if (/\benum\b/.test(typeLabel)) {
        suggested = 128
    }

    return clampColumnWidth(Math.max(suggested, nameFloor))
}

function parseDeclaredTypeLength(typeLabel: string): number | null {
    const match = typeLabel.match(/\(\s*(\d+)(?:\s*,\s*\d+)?\s*\)/)
    if (!match) return null
    const value = Number(match[1])
    return Number.isFinite(value) ? value : null
}

export interface GridViewState {
    columnFilters: Record<string, string>
    /** WHERE SQL 片段（优先于 columnFilters） */
    whereExpression?: string
    sortColumn: string | null
    sortDirection: GridSortDirection | null
    /** 多列排序（优先）；缺省时回退 sortColumn/sortDirection */
    sortSpecs?: Array<{column: string; direction: GridSortDirection}>
    /** 列宽（按 columnRowKey） */
    columnWidths: Record<string, number>
    /** 列展示顺序（columnRowKey 列表）；空则跟随数据源顺序 */
    columnOrder: string[]
    /** 左固定数据列（可选；旧持久化缺省 = 空） */
    pinnedColumns?: string[]
    /** 右固定数据列（可选） */
    pinnedRightColumns?: string[]
    /** 隐藏列（可选；旧持久化缺省 = 空） */
    hiddenColumns?: string[]
}

export const GRID_VIEW_STATE_STORAGE_KEY = 'dw-grid-view-state-v1'

export function createEmptyGridViewState(): GridViewState {
    return {
        columnFilters: {},
        whereExpression: '',
        sortColumn: null,
        sortDirection: null,
        sortSpecs: [],
        columnWidths: {},
        columnOrder: [],
        pinnedColumns: [],
        pinnedRightColumns: [],
        hiddenColumns: [],
    }
}

export function gridViewStateIsActive(state: GridViewState): boolean {
    const hasExpression = Boolean(state.whereExpression?.trim())
    const hasFilters = Object.values(state.columnFilters).some((value) => value.trim().length > 0)
    return hasExpression || hasFilters || resolveSortSpecs(state).length > 0
}

export function cellMatchesFilter(cellText: string, filter: string): boolean {
    const query = filter.trim().toLowerCase()
    if (!query) return true
    return cellText.toLowerCase().includes(query)
}

export function compareCellValues(left: unknown, right: unknown): number {
    if (left == null && right == null) return 0
    if (left == null) return 1
    if (right == null) return -1
    if (typeof left === 'number' && typeof right === 'number') {
        return left - right
    }
    return formatCellFullValue(left).localeCompare(
        formatCellFullValue(right),
        undefined,
        {numeric: true, sensitivity: 'base'},
    )
}

/** O(1) column lookup for filter/sort hot paths over large loaded sets. */
function indexGridColumns(columns: TableColumn[]): {
    byExact: Map<string, TableColumn>
    byLower: Map<string, TableColumn>
} {
    const byExact = new Map<string, TableColumn>()
    const byLower = new Map<string, TableColumn>()
    for (const column of columns) {
        const key = columnRowKey(column)
        byExact.set(key, column)
        byExact.set(column.name, column)
        byLower.set(key.toLowerCase(), column)
        byLower.set(column.name.toLowerCase(), column)
    }
    return {byExact, byLower}
}

export function applyGridViewStateToRows(
    rows: TableRow[],
    columns: TableColumn[],
    state: GridViewState,
): TableRow[] {
    let result = rows
    const {byExact, byLower} = indexGridColumns(columns)

    const whereExpression = state.whereExpression?.trim() ?? ''
    if (whereExpression) {
        result = result.filter((row) =>
            rowMatchesWhereExpression(whereExpression, (columnName) => {
                const column = byLower.get(columnName.toLowerCase())
                if (!column) return undefined
                return readRowCell(row, column)
            }),
        )
    } else {
        const activeFilters = Object.entries(state.columnFilters).filter(([, value]) => value.trim())
        if (activeFilters.length) {
            result = result.filter((row) =>
                activeFilters.every(([columnKey, filter]) => {
                    const column = byExact.get(columnKey)
                    if (!column) return true
                    const text = formatCellFullValue(readRowCell(row, column))
                    return cellMatchesFilter(text, filter)
                }),
            )
        }
    }

    const specs = resolveSortSpecs(state)
    if (specs.length) {
        const sortColumns = specs.map((spec) => byExact.get(spec.column))
        result = [...result].sort((left, right) => {
            for (let i = 0; i < specs.length; i++) {
                const column = sortColumns[i]
                if (!column) continue
                const cmp = compareCellValues(readRowCell(left, column), readRowCell(right, column))
                if (cmp !== 0) return cmp * (specs[i]!.direction === 'asc' ? 1 : -1)
            }
            return 0
        })
    }

    return result
}

export function resolveSortSpecs(state: GridViewState): Array<{column: string; direction: GridSortDirection}> {
    if (state.sortSpecs?.length) return state.sortSpecs
    if (state.sortColumn && state.sortDirection) {
        return [{column: state.sortColumn, direction: state.sortDirection}]
    }
    return []
}

function normalizeColumnWidths(raw: unknown): Record<string, number> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const widths: Record<string, number> = {}
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const width = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(width)) continue
        widths[key] = clampColumnWidth(width)
    }
    return widths
}

function normalizeColumnOrder(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export function clampColumnWidth(width: number): number {
    return Math.min(GRID_COLUMN_WIDTH_MAX, Math.max(GRID_COLUMN_WIDTH_MIN, Math.round(width)))
}

/** 按持久化顺序重排列；未知 key 追加在末尾 */
export function resolveDisplayColumns(
    columns: TableColumn[],
    columnOrder: string[] | undefined,
): TableColumn[] {
    if (!columnOrder?.length) return columns
    const byKey = new Map(columns.map((column) => [columnRowKey(column), column]))
    const ordered: TableColumn[] = []
    const used = new Set<string>()
    for (const key of columnOrder) {
        const column = byKey.get(key)
        if (!column || used.has(key)) continue
        ordered.push(column)
        used.add(key)
    }
    for (const column of columns) {
        const key = columnRowKey(column)
        if (used.has(key)) continue
        ordered.push(column)
    }
    return ordered
}

export function setGridColumnWidth(
    state: GridViewState,
    columnKey: string,
    width: number,
): GridViewState {
    return {
        ...state,
        columnWidths: {
            ...state.columnWidths,
            [columnKey]: clampColumnWidth(width),
        },
    }
}

export function moveGridColumnOrder(
    state: GridViewState,
    columns: TableColumn[],
    fromKey: string,
    toKey: string,
): GridViewState {
    if (fromKey === toKey) return state
    const current = resolveDisplayColumns(columns, state.columnOrder).map((column) => columnRowKey(column))
    const fromIndex = current.indexOf(fromKey)
    const toIndex = current.indexOf(toKey)
    if (fromIndex < 0 || toIndex < 0) return state
    const next = [...current]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    return {...state, columnOrder: next}
}

function normalizeStringKeyList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export function normalizeGridViewState(raw: unknown): GridViewState {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return createEmptyGridViewState()
    }
    const record = raw as Record<string, unknown>
    const columnFilters: Record<string, string> = {}
    if (record.columnFilters && typeof record.columnFilters === 'object' && !Array.isArray(record.columnFilters)) {
        for (const [key, value] of Object.entries(record.columnFilters)) {
            if (typeof value === 'string') columnFilters[key] = value
        }
    }
    const sortColumn = typeof record.sortColumn === 'string' && record.sortColumn.trim()
        ? record.sortColumn
        : null
    const sortDirection = record.sortDirection === 'asc' || record.sortDirection === 'desc'
        ? record.sortDirection
        : null
    return {
        columnFilters,
        whereExpression: typeof record.whereExpression === 'string' ? record.whereExpression : '',
        sortColumn: sortDirection ? sortColumn : null,
        sortDirection: sortColumn ? sortDirection : null,
        sortSpecs: normalizeSortSpecs(record.sortSpecs, sortColumn, sortDirection),
        columnWidths: normalizeColumnWidths(record.columnWidths),
        columnOrder: normalizeColumnOrder(record.columnOrder),
        pinnedColumns: normalizeStringKeyList(record.pinnedColumns),
        pinnedRightColumns: normalizeStringKeyList(record.pinnedRightColumns),
        hiddenColumns: normalizeStringKeyList(record.hiddenColumns),
    }
}

function normalizeSortSpecs(
    raw: unknown,
    sortColumn: string | null,
    sortDirection: GridSortDirection | null,
): Array<{column: string; direction: GridSortDirection}> {
    if (Array.isArray(raw)) {
        const specs: Array<{column: string; direction: GridSortDirection}> = []
        for (const item of raw) {
            if (!item || typeof item !== 'object') continue
            const rec = item as Record<string, unknown>
            const column = typeof rec.column === 'string' ? rec.column : null
            const direction = rec.direction === 'asc' || rec.direction === 'desc' ? rec.direction : null
            if (column && direction) specs.push({column, direction})
        }
        if (specs.length) return specs
    }
    if (sortColumn && sortDirection) return [{column: sortColumn, direction: sortDirection}]
    return []
}

export function toggleGridSort(
    state: GridViewState,
    columnKey: string,
    options?: {multi?: boolean},
): GridViewState {
    const multi = Boolean(options?.multi)
    const specs = [...resolveSortSpecs(state)]
    const index = specs.findIndex((spec) => spec.column === columnKey)

    if (!multi) {
        if (state.sortColumn !== columnKey || !state.sortDirection) {
            return syncPrimarySort({...state, sortSpecs: [{column: columnKey, direction: 'asc'}]})
        }
        if (state.sortDirection === 'asc') {
            return syncPrimarySort({...state, sortSpecs: [{column: columnKey, direction: 'desc'}]})
        }
        return syncPrimarySort({...state, sortSpecs: []})
    }

    if (index < 0) {
        specs.push({column: columnKey, direction: 'asc'})
    } else if (specs[index]!.direction === 'asc') {
        specs[index] = {column: columnKey, direction: 'desc'}
    } else {
        specs.splice(index, 1)
    }
    return syncPrimarySort({...state, sortSpecs: specs})
}

function syncPrimarySort(state: GridViewState): GridViewState {
    const specs = state.sortSpecs ?? []
    const first = specs[0]
    return {
        ...state,
        sortSpecs: specs,
        sortColumn: first?.column ?? null,
        sortDirection: first?.direction ?? null,
    }
}

export function setGridColumnFilter(
    state: GridViewState,
    columnKey: string,
    value: string,
): GridViewState {
    const nextFilters = {...state.columnFilters}
    const trimmed = value.trim()
    if (trimmed) {
        nextFilters[columnKey] = value
    } else {
        delete nextFilters[columnKey]
    }
    return {...state, columnFilters: nextFilters}
}

/** 清除筛选/排序，保留列宽与顺序 / pin / 显隐 */
export function clearGridViewState(state?: GridViewState): GridViewState {
    return {
        columnFilters: {},
        whereExpression: '',
        sortColumn: null,
        sortDirection: null,
        sortSpecs: [],
        columnWidths: state?.columnWidths ?? {},
        columnOrder: state?.columnOrder ?? [],
        pinnedColumns: state?.pinnedColumns ?? [],
        pinnedRightColumns: state?.pinnedRightColumns ?? [],
        hiddenColumns: state?.hiddenColumns ?? [],
    }
}
