import {api} from '@/shared/api'
import type {TableDetailFetchOptions, TableSqlExportOptions} from '@/shared/api/types'

export const tableDetailApi = {
    fetchProperties: (tableName: string, options?: TableDetailFetchOptions) =>
        api.tableDetail.fetchProperties(tableName, options),
    fetchDdl: (tableName: string, options?: TableDetailFetchOptions) =>
        api.tableDetail.fetchDdl(tableName, options),
    fetchRelations: (tableName: string, options?: TableDetailFetchOptions) =>
        api.tableDetail.fetchRelations(tableName, options),
    fetchSchemaRelations: (options?: TableDetailFetchOptions) =>
        api.tableDetail.fetchSchemaRelations(options),
    fetchSchemaTables: (options?: TableDetailFetchOptions) =>
        api.tableDetail.fetchSchemaTables(options),
    exportTableSql: (tableName: string, options?: TableSqlExportOptions) =>
        api.tableDetail.exportTableSql(tableName, options),
    exportDatabaseSql: (options: TableSqlExportOptions) =>
        api.tableDetail.exportDatabaseSql(options),
    previewDatabaseMetadoc: (options: import('@/shared/api/types').MetadataDocPreviewOptions) =>
        api.tableDetail.previewDatabaseMetadoc(options),
}
