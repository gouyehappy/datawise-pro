import type {TableColumn, TableRow} from '@/core/types'
import {columnRowKey, readRowCell} from '@/core/utils/query-result-column'
import {formatCellFullValue} from '@/core/utils/cell-value-format'

/** 尝试把 Mongo 网格里的 JSON 字符串还原为对象/数组，便于整行美化展示 */
export function reviveMongoCellValue(value: unknown): unknown {
    if (value == null) return null
    if (typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value !== 'string') {
        return value
    }
    const trimmed = value.trim()
    if (!trimmed) return value
    const looksJson =
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
        || (trimmed.startsWith('[') && trimmed.endsWith(']'))
    if (!looksJson) return value
    try {
        return JSON.parse(trimmed) as unknown
    } catch {
        return value
    }
}

/** 由网格列 + 行还原近似原始文档（字段名为列名） */
export function buildDocumentFromGridRow(
    columns: readonly TableColumn[],
    row: TableRow,
): Record<string, unknown> {
    const doc: Record<string, unknown> = {}
    for (const column of columns) {
        const key = columnRowKey(column)
        const raw = Object.prototype.hasOwnProperty.call(row, key)
            ? row[key]
            : readRowCell(row, column)
        doc[column.name] = reviveMongoCellValue(raw)
    }
    return doc
}

export function formatMongoDocumentJson(document: Record<string, unknown>): string {
    return JSON.stringify(document, null, 2)
}

/** 详情弹窗副标题：优先展示 _id */
export function resolveMongoDocumentRowLabel(
    document: Record<string, unknown>,
    rowNumber: number,
): string {
    const id = document._id
    if (id == null || id === '') {
        return `#${rowNumber}`
    }
    const idText = typeof id === 'string' || typeof id === 'number' || typeof id === 'boolean'
        ? String(id)
        : formatCellFullValue(id)
    return `#${rowNumber} · _id ${idText}`
}
