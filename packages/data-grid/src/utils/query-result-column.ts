import type {TableColumn, TableRow} from '../grid-types'
import {formatCellFullValue, formatCellPreviewValue, type TableCellValue} from './cell-value-format'

export type ScalarCellValue = string | number | boolean | null

export function columnRowKey(col: TableColumn): string {
  return col.key ?? col.name
}

export function readRowCell(row: TableRow, col: TableColumn): TableCellValue {
  const value = row[columnRowKey(col)]
  if (value === undefined) return null
  return value
}

/** DML / export / PK: serialize complex JSON cells to string */
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
