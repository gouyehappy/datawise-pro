import type {TableColumn, TableRow} from '@/core/types'
import type {
    TableDataApi,
    TableDataChangeAuditEntry,
    TableDataResult,
    TableRowMutateResult,
} from '@/shared/api/types'
import type {
    TableDataChangeAuditEntryDto,
    TableDataResultDto,
} from '@/shared/api/generated'
import {getJson, postJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

function mapTableData(wire: TableDataResultDto): TableDataResult {
    return {
        columns: (wire.columns ?? []) as unknown as TableColumn[],
        rows: (wire.rows ?? []) as unknown as TableRow[],
        cursorId: wire.cursorId,
        hasMore: wire.hasMore,
        pageOffset: wire.pageOffset,
        pageSize: wire.pageSize,
    }
}

function mapAuditEntry(wire: TableDataChangeAuditEntryDto): TableDataChangeAuditEntry {
    return {
        id: String(wire.id ?? ''),
        createdAtMs: Number(wire.createdAtMs ?? 0),
        operation: String(wire.operation ?? '') as TableDataChangeAuditEntry['operation'],
        beforeRow: (wire.beforeRow ?? undefined) as TableDataChangeAuditEntry['beforeRow'],
        afterRow: (wire.afterRow ?? undefined) as TableDataChangeAuditEntry['afterRow'],
        primaryKey: (wire.primaryKey ?? undefined) as TableDataChangeAuditEntry['primaryKey'],
        reverted: Boolean(wire.reverted),
        restoredFromId: wire.restoredFromId ?? null,
    }
}

export function createHttpTableDataApi(): TableDataApi {
    return {
        fetch: async (tableName, options) => {
            if (!tableName?.trim()) {
                return {columns: [], rows: []}
            }
            const connectionId = options?.connectionId
            if (!connectionId?.trim()) {
                throw new Error('connectionId is required')
            }
            return mapTableData(
                await getJson<TableDataResultDto>(
                    API_PATHS.tableData(tableName, {
                        connectionId,
                        database: options?.database,
                        maxRows: options?.maxRows,
                        cursorId: options?.cursorId,
                        filter: options?.filter,
                    }),
                    undefined,
                    options?.signal ? {signal: options.signal} : undefined,
                ),
            )
        },
        insertRow: (tableName, request) =>
            postJson<TableRowMutateResult>(API_PATHS.tableRows(tableName), request),
        updateRow: (tableName, request) =>
            postJson<TableRowMutateResult>(API_PATHS.tableRowsUpdate(tableName), request),
        deleteRow: (tableName, request) =>
            postJson<TableRowMutateResult>(API_PATHS.tableRowsDelete(tableName), request),
        listAudit: async (tableName, options) => {
            if (!tableName?.trim()) return []
            const connectionId = options.connectionId
            if (!connectionId?.trim()) {
                throw new Error('connectionId is required')
            }
            const wire = await getJson<TableDataChangeAuditEntryDto[]>(
                API_PATHS.tableDataAudit(tableName, {
                    connectionId,
                    database: options.database,
                    limit: options.limit,
                }),
            )
            return (wire ?? []).map(mapAuditEntry)
        },
        restoreAudit: (tableName, auditId, request) =>
            postJson<TableRowMutateResult>(API_PATHS.tableDataAuditRestore(tableName, auditId), request),
    }
}
