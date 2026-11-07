import type {
    MetadataDocPreviewOptions,
    MetadataDocPreviewResult,
    SchemaRelationsResult,
    SchemaTablesResult,
    TableDetailApi,
    TableDdlResult,
    TablePropertiesResult,
    TableRelationsResult,
    TableSqlExportOptions,
    TableSqlExportResult,
} from '@/shared/api/types'
import type {
    MetadataDocPreviewResultDto,
    SchemaRelationsResultDto,
    SchemaTablesResultDto,
    TableDdlResultDto,
    TablePropertiesResultDto,
    TableRelationsResultDto,
    TableSqlExportResultDto,
} from '@/shared/api/generated'
import {getJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

function requireConnectionId(connectionId?: string): string {
    const trimmed = connectionId?.trim()
    if (!trimmed) {
        throw new Error('connectionId is required')
    }
    return trimmed
}

function mapProperties(wire: TablePropertiesResultDto): TablePropertiesResult {
    return {
        tableName: String(wire.tableName ?? ''),
        comment: wire.comment ?? null,
        engine: wire.engine ?? null,
        charset: wire.charset ?? null,
        collation: wire.collation ?? null,
        autoIncrement: wire.autoIncrement ?? null,
        columns: (wire.columns ?? []) as TablePropertiesResult['columns'],
        foreignKeys: (wire.foreignKeys ?? []) as TablePropertiesResult['foreignKeys'],
        indexes: (wire.indexes ?? []) as TablePropertiesResult['indexes'],
    }
}

function mapDdl(wire: TableDdlResultDto): TableDdlResult {
    return {ddl: String(wire.ddl ?? '')}
}

function mapSqlExport(wire: TableSqlExportResultDto): TableSqlExportResult {
    return {
        sql: String(wire.sql ?? ''),
        fileName: String(wire.fileName ?? ''),
    }
}

function mapRelations(wire: TableRelationsResultDto): TableRelationsResult {
    return wire as TableRelationsResult
}

function mapSchemaRelations(wire: SchemaRelationsResultDto): SchemaRelationsResult {
    return wire as SchemaRelationsResult
}

function mapSchemaTables(wire: SchemaTablesResultDto): SchemaTablesResult {
    return {
        database: String(wire.database ?? ''),
        tables: (wire.tables ?? []) as SchemaTablesResult['tables'],
    }
}

function mapMetadoc(wire: MetadataDocPreviewResultDto): MetadataDocPreviewResult {
    return {
        database: String(wire.database ?? ''),
        connectionId: wire.connectionId ?? null,
        format: String(wire.format ?? 'md'),
        fileName: String(wire.fileName ?? ''),
        markdown: String(wire.markdown ?? ''),
        html: String(wire.html ?? ''),
    }
}

export function createHttpTableDetailApi(): TableDetailApi {
    return {
        fetchProperties: async (tableName, options) => {
            if (!tableName?.trim()) {
                throw new Error('tableName is required')
            }
            return mapProperties(
                await getJson<TablePropertiesResultDto>(
                    API_PATHS.tableProperties(tableName, {
                        connectionId: requireConnectionId(options?.connectionId),
                        database: options?.database,
                        kind: options?.kind,
                    }),
                ),
            )
        },
        fetchDdl: async (tableName, options) => {
            if (!tableName?.trim()) {
                throw new Error('tableName is required')
            }
            return mapDdl(
                await getJson<TableDdlResultDto>(
                    API_PATHS.tableDdl(tableName, {
                        connectionId: requireConnectionId(options?.connectionId),
                        database: options?.database,
                        kind: options?.kind,
                    }),
                ),
            )
        },
        fetchRelations: async (tableName, options) => {
            if (!tableName?.trim()) {
                throw new Error('tableName is required')
            }
            return mapRelations(
                await getJson<TableRelationsResultDto>(
                    API_PATHS.tableRelations(tableName, {
                        connectionId: requireConnectionId(options?.connectionId),
                        database: options?.database,
                    }),
                ),
            )
        },
        fetchSchemaRelations: async (options) =>
            mapSchemaRelations(
                await getJson<SchemaRelationsResultDto>(
                    API_PATHS.schemaRelations({
                        connectionId: requireConnectionId(options?.connectionId),
                        database: options?.database,
                    }),
                ),
            ),
        fetchSchemaTables: async (options) =>
            mapSchemaTables(
                await getJson<SchemaTablesResultDto>(
                    API_PATHS.schemaTables({
                        connectionId: requireConnectionId(options?.connectionId),
                        database: options?.database,
                    }),
                ),
            ),
        exportTableSql: async (tableName, options) => {
            if (!tableName?.trim()) {
                throw new Error('tableName is required')
            }
            return mapSqlExport(
                await getJson<TableSqlExportResultDto>(
                    API_PATHS.tableExportSql(tableName, {
                        connectionId: requireConnectionId(options?.connectionId),
                        database: options?.database,
                        includeData: options?.includeData,
                        maxRows: options?.maxRows,
                    }),
                ),
            )
        },
        exportDatabaseSql: async (options) => {
            const resolved: TableSqlExportOptions = options ?? {}
            return mapSqlExport(
                await getJson<TableSqlExportResultDto>(
                    API_PATHS.databaseExportSql({
                        connectionId: requireConnectionId(resolved.connectionId),
                        database: resolved.database,
                        includeData: resolved.includeData,
                        maxRows: resolved.maxRows,
                    }),
                ),
            )
        },
        previewDatabaseMetadoc: async (options) => {
            const resolved: MetadataDocPreviewOptions = options ?? {}
            return mapMetadoc(
                await getJson<MetadataDocPreviewResultDto>(
                    API_PATHS.databaseMetadocPreview({
                        connectionId: requireConnectionId(resolved.connectionId),
                        database: resolved.database,
                        format: resolved.format,
                        includeDetails: resolved.includeDetails,
                    }),
                ),
            )
        },
    }
}
