import type {TableColumn, TableRow} from '@/core/types'
import {formatCellFullValue, formatCellPreviewValue, type TableCellValue} from '@/core/utils/cell-value-format'

export type ScalarCellValue = string | number | boolean | null

export function columnRowKey(col: TableColumn): string {
    return col.key ?? col.name
}

export function readRowCell(
    row: TableRow,
    col: TableColumn,
): TableCellValue {
    const value = row[columnRowKey(col)]
    if (value === undefined) return null
    return value
}

/** DML / 导出 / 主键：复杂 JSON 单元格序列化为字符串 */
export function readRowCellScalar(row: TableRow, col: TableColumn): ScalarCellValue {
    const value = readRowCell(row, col)
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value
    }
    return formatCellFullValue(value)
}

export function readRowCellText(row: TableRow, col: TableColumn): string {
    return formatCellPreviewValue(readRowCell(row, col))
}
