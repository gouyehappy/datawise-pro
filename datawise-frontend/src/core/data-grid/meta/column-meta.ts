import type {TableColumn} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'

const NUMERIC_TYPE_RE =
    /\b(int|integer|bigint|smallint|tinyint|mediumint|serial|bigserial|decimal|numeric|number|float|double|real|money|bit)\b/i

const DATETIME_TYPE_RE =
    /\b(datetime|timestamp|timestamptz|datetime2|smalldatetime)\b/i
const DATE_TYPE_RE = /\bdate\b/i
const TIME_TYPE_RE = /\b(time|timetz)\b/i
const BOOLEAN_TYPE_RE = /\b(bool|boolean|bit)\b/i

export type GridTemporalKind = 'datetime' | 'date' | 'time'
export type GridColumnTypeKind = 'number' | 'string' | 'datetime' | 'boolean' | 'other'

function detailForColumn(
    column: TableColumn,
    details: TableColumnDetail[],
): TableColumnDetail | undefined {
    return details.find((detail) => detail.name === column.name)
}

/** 表头类型文案：优先 columnDetails.dataType，其次结果列 type */
export function resolveGridColumnTypeLabel(
    column: TableColumn,
    details: TableColumnDetail[] = [],
): string {
    const detail = detailForColumn(column, details)
    const raw = detail?.dataType?.trim() || column.type?.trim() || ''
    return raw
}

/** 表头字段注释：优先 columnDetails.comment */
export function resolveGridColumnCommentLabel(
    column: TableColumn,
    details: TableColumnDetail[] = [],
): string {
    const detail = detailForColumn(column, details)
    return detail?.comment?.trim() || ''
}

export function isGridColumnPrimaryKey(
    column: TableColumn,
    pkColumns: string[] = [],
    details: TableColumnDetail[] = [],
): boolean {
    if (pkColumns.includes(column.name)) return true
    const keyType = detailForColumn(column, details)?.keyType?.trim().toUpperCase() ?? ''
    return keyType === 'PRI' || keyType === 'PK' || keyType === 'PRIMARY' || keyType.startsWith('PRIMARY')
}

/** 数值列右对齐启发式（基于类型名） */
export function isGridNumericColumn(
    column: TableColumn,
    details: TableColumnDetail[] = [],
): boolean {
    const typeLabel = resolveGridColumnTypeLabel(column, details)
    if (!typeLabel) return false
    return NUMERIC_TYPE_RE.test(typeLabel)
}

/** 日期 / 时间 / 日期时间列（编辑时弹出选择器） */
export function resolveGridTemporalKind(
    column: TableColumn,
    details: TableColumnDetail[] = [],
): GridTemporalKind | null {
    const typeLabel = resolveGridColumnTypeLabel(column, details)
    if (!typeLabel) return null
    if (DATETIME_TYPE_RE.test(typeLabel)) return 'datetime'
    // 避免 datetime 已被上面匹配；纯 date / time 用词边界
    if (DATE_TYPE_RE.test(typeLabel) && !/\bdatetime\b/i.test(typeLabel)) return 'date'
    if (TIME_TYPE_RE.test(typeLabel) && !/\bdatetime\b/i.test(typeLabel) && !/\btimestamp\b/i.test(typeLabel)) {
        return 'time'
    }
    return null
}

export function isGridTemporalColumn(
    column: TableColumn,
    details: TableColumnDetail[] = [],
): boolean {
    return resolveGridTemporalKind(column, details) != null
}

/** 单元格类型着色用的粗分类型 */
export function resolveGridColumnTypeKind(
    column: TableColumn,
    details: TableColumnDetail[] = [],
): GridColumnTypeKind {
    if (isGridNumericColumn(column, details)) return 'number'
    if (resolveGridTemporalKind(column, details) != null) return 'datetime'
    const typeLabel = resolveGridColumnTypeLabel(column, details)
    if (typeLabel && BOOLEAN_TYPE_RE.test(typeLabel)) return 'boolean'
    if (typeLabel) return 'string'
    return 'other'
}
