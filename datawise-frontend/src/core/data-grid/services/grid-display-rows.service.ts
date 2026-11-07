import type {TableColumn} from '@/core/types'
import {columnRowKey, readRowCell} from '@/core/utils/query-result-column'
import {formatCellFullValue} from '@/core/utils/cell-value-format'
import {
    cellMatchesFilter,
    compareCellValues,
    resolveSortSpecs,
    type GridViewState,
} from '@/core/data-grid/services/grid-view-state.service'
import {rowMatchesWhereExpression} from '@/core/data-grid/services/grid-where-expression.service'
import type {GridDisplayRow} from '../edit/useGridPendingEdit'

export type GridCellDisplayText = (item: GridDisplayRow, columnName: string) => string

export function readRawDisplayRowCell(
    item: GridDisplayRow,
    column: TableColumn,
    getCellDisplayText: GridCellDisplayText,
): unknown {
    if (item.kind === 'insert') {
        const text = getCellDisplayText(item, column.name)
        return text === '' ? null : text
    }
    if (item.originalRow) return readRowCell(item.originalRow, column)
    return null
}

export function filterAndSortDisplayRows(
    rows: GridDisplayRow[],
    columns: TableColumn[],
    state: GridViewState,
    getCellDisplayText: GridCellDisplayText,
): GridDisplayRow[] {
    let result = rows
    const byExact = new Map<string, TableColumn>()
    const byLower = new Map<string, TableColumn>()
    for (const entry of columns) {
        const key = columnRowKey(entry)
        byExact.set(key, entry)
        byExact.set(entry.name, entry)
        byLower.set(key.toLowerCase(), entry)
        byLower.set(entry.name.toLowerCase(), entry)
    }

    const whereExpression = state.whereExpression?.trim() ?? ''
    if (whereExpression) {
        result = result.filter((item) =>
            rowMatchesWhereExpression(whereExpression, (columnName) => {
                const column = byLower.get(columnName.toLowerCase())
                if (!column) return undefined
                return readRawDisplayRowCell(item, column, getCellDisplayText)
            }),
        )
    } else {
        const activeFilters = Object.entries(state.columnFilters).filter(([, value]) => value.trim())
        if (activeFilters.length) {
            result = result.filter((item) =>
                activeFilters.every(([columnKey, filter]) => {
                    const column = byExact.get(columnKey)
                    if (!column) return true
                    const value = readRawDisplayRowCell(item, column, getCellDisplayText)
                    const text = formatCellFullValue(value)
                    return cellMatchesFilter(text, filter)
                }),
            )
        }
    }

    const specs = resolveSortSpecs(state)
    if (specs.length) {
        const sortColumns = specs.map((spec) => byExact.get(spec.column))
        if (result === rows) result = result.slice()
        result.sort((left, right) => {
            for (let i = 0; i < specs.length; i++) {
                const column = sortColumns[i]
                if (!column) continue
                const cmp = compareCellValues(
                    readRawDisplayRowCell(left, column, getCellDisplayText),
                    readRawDisplayRowCell(right, column, getCellDisplayText),
                )
                if (cmp !== 0) return cmp * (specs[i]!.direction === 'asc' ? 1 : -1)
            }
            return 0
        })
    }

    return result
}
