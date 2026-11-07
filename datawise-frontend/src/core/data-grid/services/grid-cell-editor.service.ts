import type {TableColumn} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import {formatCellFullValue, isExpandableCellValue} from '@/core/utils/cell-value-format'
import {resolveGridColumnTypeLabel} from '@/core/data-grid/meta/column-meta'
import type {GridCellEditorKind} from '@datawise/data-grid'

export type {GridCellEditorKind} from '@datawise/data-grid'
export {
    formatJsonEditorText,
    validateJsonEditorText,
} from '@datawise/data-grid'

const JSON_TYPE_RE = /\bjson\b/i
const BINARY_TYPE_RE = /\b(blob|binary|bytea|varbinary|longblob|mediumblob|tinyblob|image|bfile|raw)\b/i
const LOB_TEXT_TYPE_RE = /\b(longtext|mediumtext|tinytext|clob|ntext)\b/i

function looksLikeJsonText(text: string): boolean {
    const trimmed = text.trim()
    return (trimmed.startsWith('{') && trimmed.endsWith('}'))
        || (trimmed.startsWith('[') && trimmed.endsWith(']'))
}

/** mediumtext / longtext / clob 等大文本列 */
export function isLobTextColumn(
    column: TableColumn,
    columnDetails: TableColumnDetail[] = [],
): boolean {
    return LOB_TEXT_TYPE_RE.test(resolveGridColumnTypeLabel(column, columnDetails))
}

/** 根据列类型与单元格值推断专用编辑器种类 */
export function resolveGridCellEditorKind(
    column: TableColumn,
    columnDetails: TableColumnDetail[] = [],
    value?: unknown,
): GridCellEditorKind {
    const typeLabel = resolveGridColumnTypeLabel(column, columnDetails)
    if (BINARY_TYPE_RE.test(typeLabel)) return 'binary'
    if (JSON_TYPE_RE.test(typeLabel)) return 'json'
    if (isLobTextColumn(column, columnDetails)) return 'longText'

    if (value != null) {
        const full = formatCellFullValue(value)
        if (looksLikeJsonText(full)) return 'json'
        if (isExpandableCellValue(value) || full.length > 96) return 'longText'
    }
    return 'text'
}

export function shouldUseDedicatedCellEditor(
    column: TableColumn,
    columnDetails: TableColumnDetail[] = [],
    value?: unknown,
): boolean {
    const kind = resolveGridCellEditorKind(column, columnDetails, value)
    return kind === 'longText' || kind === 'json' || kind === 'binary'
}
