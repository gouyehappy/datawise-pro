import type {SqlColumnMeta} from '@sql-editor/types'

/** 列名是否匹配前缀（前缀 + 子串模糊） */
export function matchesColumnPrefix(columnName: string, prefix: string): boolean {
    if (!prefix) return true
    const name = columnName.toLowerCase()
    const p = prefix.toLowerCase()
    if (name.startsWith(p)) return true
    if (p.length >= 2 && name.includes(p)) return true
    return false
}

/** 将表列展开为 SELECT 列表文本 */
export function buildExpandedColumnList(
    columns: SqlColumnMeta[],
    table: string,
    alias: string,
    multiTable: boolean,
    multiline = false,
): string {
    const usePrefix = multiTable || alias.toLowerCase() !== table.toLowerCase()
    const parts = columns.map((meta) =>
        usePrefix ? `${alias}.${meta.name}` : meta.name,
    )
    if (multiline && parts.length > 1) {
        return parts.join(',\n  ')
    }
    return parts.join(', ')
}
