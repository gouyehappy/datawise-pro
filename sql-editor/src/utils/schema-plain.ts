import type {SqlColumnMeta, SqlEditorSchema} from '@sql-editor/types'

/** 去掉 Vue Proxy 等，得到可 structuredClone / postMessage 的列元数据 */
export function toPlainColumnMeta(col: SqlColumnMeta): SqlColumnMeta {
    const plain: SqlColumnMeta = {name: String(col.name)}
    if (col.type) plain.type = col.type
    if (col.pk) plain.pk = col.pk
    if (col.comment) plain.comment = col.comment
    if (col.enumValues?.length) plain.enumValues = col.enumValues.map(String)
    if (col.nullable !== undefined) plain.nullable = Boolean(col.nullable)
    if (col.defaultValue !== undefined && col.defaultValue !== '') {
        plain.defaultValue = String(col.defaultValue)
    }
    return plain
}

/** Worker 与 runtime 边界：schema 必须是 plain object，不能是 reactive Proxy */
export function toPlainSqlEditorSchema(schema: SqlEditorSchema): SqlEditorSchema {
    const plain: SqlEditorSchema = {
        tables: schema.tables.map(String),
        columns: Object.fromEntries(
            Object.entries(schema.columns).map(([table, cols]) => [
                table,
                cols.map(toPlainColumnMeta),
            ]),
        ),
    }
    if (schema.foreignKeys?.length) {
        plain.foreignKeys = schema.foreignKeys.map((fk) => ({...fk}))
    }
    if (schema.tableCatalogs) {
        plain.tableCatalogs = {...schema.tableCatalogs}
    }
    if (schema.tableComments && Object.keys(schema.tableComments).length) {
        plain.tableComments = {...schema.tableComments}
    }
    if (schema.catalogs?.length) {
        plain.catalogs = schema.catalogs.map(String)
    }
    if (schema.schemasByCatalog) {
        plain.schemasByCatalog = Object.fromEntries(
            Object.entries(schema.schemasByCatalog).map(([catalog, schemas]) => [
                catalog,
                schemas.map(String),
            ]),
        )
    }
    if (schema.tablesByDatabase && Object.keys(schema.tablesByDatabase).length) {
        plain.tablesByDatabase = Object.fromEntries(
            Object.entries(schema.tablesByDatabase).map(([scope, bundle]) => [
                scope,
                {
                    tables: bundle.tables.map(String),
                    tableIds: {...bundle.tableIds},
                    ...(bundle.tableComments && Object.keys(bundle.tableComments).length
                        ? {tableComments: {...bundle.tableComments}}
                        : {}),
                },
            ]),
        )
    }
    if (schema.columnCount !== undefined) {
        plain.columnCount = schema.columnCount
    }
    return plain
}

/** Worker 请求体：仅保留 context 分析需要的 tables + column names */
export function workerSchemaPayload(
    tables: string[],
    columns: Record<string, { name: string }[]>,
): { tables: string[]; columns: Record<string, { name: string }[]> } {
    return {
        tables: tables.map(String),
        columns: Object.fromEntries(
            Object.entries(columns).map(([table, cols]) => [
                table,
                cols.map((col) => ({name: String(col.name)})),
            ]),
        ),
    }
}
