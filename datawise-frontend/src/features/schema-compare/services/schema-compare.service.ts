import type {TableColumnDetail, TablePropertiesResult} from '@/shared/api/types'

import {tableDetailApi} from '@/api'

import {fetchAiSchemaTables} from '@/features/ai/datasource/services/ai-schema.service'

import type {

    ColumnSchemaSnapshot,

    SchemaCompareResult,

    SchemaScope,

} from '@/features/schema-compare/types/schema-compare.types'

import {toColumnSnapshot} from '@/features/schema-compare/types/schema-compare.types'

import {
    buildCreateTableDdlFromColumns,
    buildSchemaMigrateDdl,
} from '@/features/schema-compare/services/schema-compare-ddl.service'

import {

    diffColumns,

    diffTableNames,

    summarizeTableDiffs,

} from '@/features/schema-compare/services/schema-compare-diff.service'



async function fetchTableColumns(scope: SchemaScope, tableName: string): Promise<ColumnSchemaSnapshot[]> {

    const properties = await tableDetailApi.fetchProperties(tableName, {

        connectionId: scope.connectionId,

        database: scope.database,

    })

    return properties.columns.map(toColumnSnapshot)

}

/** 优先参考侧真实 DDL；失败或为空时用列快照按目标方言合成 CREATE TABLE */
async function resolveCreateTableDdl(
    left: SchemaScope,
    right: SchemaScope,
    tableName: string,
): Promise<string | null> {
    try {
        const ddl = await tableDetailApi.fetchDdl(tableName, {
            connectionId: left.connectionId,
            database: left.database,
        })
        const text = ddl.ddl?.trim()
        if (text) return text
    } catch {
        // fall through to column synthesis
    }

    try {
        const columns = await fetchTableColumns(left, tableName)
        return buildCreateTableDdlFromColumns(right.dbType, tableName, columns, right.database)
    } catch {
        return null
    }
}



export async function compareSchemaScopes(

    left: SchemaScope,

    right: SchemaScope,

    options?: { tableFilter?: string[] },

): Promise<SchemaCompareResult> {

    const [leftTables, rightTables] = await Promise.all([

        fetchAiSchemaTables(left.connectionId, left.database),

        fetchAiSchemaTables(right.connectionId, right.database),

    ])



    let tableDiffs = diffTableNames(leftTables, rightTables)

    if (options?.tableFilter?.length) {

        const allowed = new Set(options.tableFilter.map((name) => name.toLowerCase()))

        tableDiffs = tableDiffs.filter((item) => allowed.has(item.tableName.toLowerCase()))

    }



    const createDdls = new Map<string, string>()



    for (const item of tableDiffs) {

        if (item.status === 'unchanged') {

            const [leftColumns, rightColumns] = await Promise.all([

                fetchTableColumns(left, item.tableName),

                fetchTableColumns(right, item.tableName),

            ])

            const columnDiffs = diffColumns(leftColumns, rightColumns)

            item.columnDiffs = columnDiffs

            if (columnDiffs.length) item.status = 'changed'

            continue

        }



        if (item.status === 'added') {

            const createDdl = await resolveCreateTableDdl(left, right, item.tableName)

            if (createDdl) createDdls.set(item.tableName, createDdl)

        }

    }



    const ddl = buildSchemaMigrateDdl(tableDiffs, right.dbType, createDdls, right.database)

    const createDdlsRecord: Record<string, string> = {}
    for (const [key, value] of createDdls.entries()) {
        createDdlsRecord[key] = value
    }

    return {

        tableDiffs,

        ddl,

        summary: summarizeTableDiffs(tableDiffs),

        createDdls: createDdlsRecord,

    }

}



export function propertiesToSnapshots(properties: TablePropertiesResult): ColumnSchemaSnapshot[] {

    return properties.columns.map(toColumnSnapshot)

}



export function snapshotsFromColumnDetails(columns: TableColumnDetail[]): ColumnSchemaSnapshot[] {

    return columns.map(toColumnSnapshot)

}



export {diffColumns, diffTableNames} from '@/features/schema-compare/services/schema-compare-diff.service'

