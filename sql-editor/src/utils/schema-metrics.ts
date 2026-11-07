import type {SqlEditorSchema} from '@sql-editor/types'

/** 统计 schema 列总数（去重按表累加） */
export function computeSchemaColumnCount(columns: Record<string, { name: string }[]>): number {
    let sum = 0
    for (const cols of Object.values(columns)) {
        sum += cols.length
    }
    return sum
}

/** 为 schema 附加/刷新 columnCount 缓存字段 */
export function withSchemaColumnCount(schema: SqlEditorSchema): SqlEditorSchema {
    const columnCount = computeSchemaColumnCount(schema.columns)
    if (schema.columnCount === columnCount) return schema
    return {...schema, columnCount}
}

/** 读取 schema 列数（优先缓存字段） */
export function schemaColumnCount(schema: SqlEditorSchema): number {
    return schema.columnCount ?? computeSchemaColumnCount(schema.columns)
}
