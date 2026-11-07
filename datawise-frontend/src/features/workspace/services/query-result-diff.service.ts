import type {TableColumn, TableRow} from '@/core/types'
import {formatCellFullValue} from '@/core/utils/cell-value-format'
import {readRowCell} from '@/core/utils/query-result-column'
import {QUERY_RESULT_DIFF_MAX_COMPARE_ROWS} from '@/features/workspace/constants/query-result-limits'
import type {QueryResultItem} from '@/features/workspace/types'

export type QueryResultCellDiffStatus = 'unchanged' | 'modified' | 'added' | 'removed'

export type QueryResultRowDiffStatus = 'unchanged' | 'modified' | 'added' | 'removed'

export interface QueryResultDiffCell {
    display: string
    previous?: string
    status: QueryResultCellDiffStatus
}

export interface QueryResultDiffDisplayRow {
    id: string
    rowStatus: QueryResultRowDiffStatus
    cells: Record<string, QueryResultDiffCell>
}

export interface QueryResultDiffSummary {
    unchangedRows: number
    modifiedRows: number
    addedRows: number
    removedRows: number
    changedCells: number
}

export interface QueryResultDiffView {
    baselineLabel: string
    currentLabel: string
    columns: TableColumn[]
    rows: QueryResultDiffDisplayRow[]
    summary: QueryResultDiffSummary
}

function mergeResultColumns(left: TableColumn[], right: TableColumn[]): TableColumn[] {
    const byName = new Map<string, TableColumn>()
    for (const column of left) byName.set(column.name, column)
    for (const column of right) byName.set(column.name, column)

    const ordered: TableColumn[] = []
    const seen = new Set<string>()
    for (const column of [...left, ...right]) {
        if (seen.has(column.name)) continue
        seen.add(column.name)
        ordered.push(byName.get(column.name)!)
    }
    return ordered
}

function readCellText(row: TableRow | undefined, column: TableColumn): string {
    if (!row) return ''
    return formatCellFullValue(readRowCell(row, column))
}

function columnPresent(columns: TableColumn[], name: string): boolean {
    return columns.some((column) => column.name === name)
}

export function canCompareQueryResults(previous: QueryResultItem | undefined, current: QueryResultItem | undefined): boolean {
    if (!previous || !current) return false
    if (previous.status !== 'success' || current.status !== 'success') return false
    if (previous.batchEntries?.length || current.batchEntries?.length) return false
    if (previous.explainPlan?.length || current.explainPlan?.length) return false
    if (!previous.columns.length || !current.columns.length) return false
    return true
}

export function buildQueryResultDiff(
    baseline: QueryResultItem,
    current: QueryResultItem,
    options?: {maxCompareRows?: number},
): QueryResultDiffView {
    const columns = mergeResultColumns(baseline.columns, current.columns)
    const compareCap = options?.maxCompareRows ?? QUERY_RESULT_DIFF_MAX_COMPARE_ROWS
    const maxRows = Math.min(
        Math.max(baseline.rows.length, current.rows.length),
        Math.max(0, compareCap),
    )
    const rows: QueryResultDiffDisplayRow[] = []
    const summary: QueryResultDiffSummary = {
        unchangedRows: 0,
        modifiedRows: 0,
        addedRows: 0,
        removedRows: 0,
        changedCells: 0,
    }

    for (let index = 0; index < maxRows; index += 1) {
        const leftRow = baseline.rows[index]
        const rightRow = current.rows[index]
        const cells: Record<string, QueryResultDiffCell> = {}
        let rowStatus: QueryResultRowDiffStatus = 'unchanged'
        let rowHasChange = false

        if (leftRow && !rightRow) {
            rowStatus = 'removed'
            for (const column of columns) {
                if (!columnPresent(baseline.columns, column.name)) continue
                const previous = readCellText(leftRow, column)
                cells[column.name] = {display: previous, previous, status: 'removed'}
                summary.changedCells += 1
            }
            summary.removedRows += 1
        } else if (!leftRow && rightRow) {
            rowStatus = 'added'
            for (const column of columns) {
                if (!columnPresent(current.columns, column.name)) continue
                const display = readCellText(rightRow, column)
                cells[column.name] = {display, status: 'added'}
                summary.changedCells += 1
            }
            summary.addedRows += 1
        } else if (leftRow && rightRow) {
            for (const column of columns) {
                const onLeft = columnPresent(baseline.columns, column.name)
                const onRight = columnPresent(current.columns, column.name)
                const leftText = onLeft ? readCellText(leftRow, column) : ''
                const rightText = onRight ? readCellText(rightRow, column) : ''

                if (!onLeft && onRight) {
                    cells[column.name] = {display: rightText, status: 'added'}
                    rowHasChange = true
                    summary.changedCells += 1
                    continue
                }
                if (onLeft && !onRight) {
                    cells[column.name] = {display: leftText, previous: leftText, status: 'removed'}
                    rowHasChange = true
                    summary.changedCells += 1
                    continue
                }
                if (leftText === rightText) {
                    cells[column.name] = {display: rightText, previous: leftText, status: 'unchanged'}
                } else {
                    cells[column.name] = {
                        display: rightText,
                        previous: leftText,
                        status: 'modified',
                    }
                    rowHasChange = true
                    summary.changedCells += 1
                }
            }
            if (rowHasChange) {
                rowStatus = 'modified'
                summary.modifiedRows += 1
            } else {
                summary.unchangedRows += 1
            }
        }

        rows.push({
            id: rightRow ? String(rightRow.id ?? `row-${index}`) : `removed-${index}`,
            rowStatus,
            cells,
        })
    }

    return {
        baselineLabel: baseline.label,
        currentLabel: current.label,
        columns,
        rows,
        summary,
    }
}
