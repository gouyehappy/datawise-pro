import type {SqlEditorSchema, SqlSchemaProvider} from '@sql-editor/types'

/** 静态 Schema → SqlSchemaProvider（无后端、演示 / 单页接入） */
export function createStaticSchemaProvider(schema: SqlEditorSchema): SqlSchemaProvider {
    const tableIds = Object.fromEntries(schema.tables.map((table) => [table, table]))
    return {
        isReady: () => true,
        loadTables: async (_connectionId: string, databaseName: string) => ({
            tables: [...schema.tables],
            tableIds: {...tableIds},
            catalog: schema.tableCatalogs
                ? undefined
                : databaseName || undefined,
            tableComments:
                schema.tableComments && Object.keys(schema.tableComments).length
                    ? {...schema.tableComments}
                    : undefined,
        }),
        loadColumns: async (tableId: string) => {
            const hit = schema.columns[tableId]
            if (hit?.length) {
                return {
                    columns: [...hit],
                    foreignKeys: schema.foreignKeys?.filter(
                        (fk) => fk.fromTable.toLowerCase() === tableId.toLowerCase(),
                    ),
                }
            }
            const byName = Object.entries(schema.columns).find(
                ([name]) => name.toLowerCase() === tableId.toLowerCase(),
            )
            const tableName = byName?.[0] ?? tableId
            return {
                columns: byName?.[1] ? [...byName[1]] : [],
                foreignKeys: schema.foreignKeys?.filter(
                    (fk) => fk.fromTable.toLowerCase() === tableName.toLowerCase(),
                ),
            }
        },
    }
}
