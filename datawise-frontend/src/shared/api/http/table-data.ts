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

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function optionalString(value: unknown): string | undefined {
    if (value == null) return undefined
    return String(value)
}

/** Explicit wire → domain mapping so vue-tsc catches column field renames (C9). */
function mapColumn(wire: unknown): TableColumn {
    const row = asRecord(wire) ?? {}
    return {
        name: String(row.name ?? ''),
        key: optionalString(row.key),
        type: optionalString(row.type),
    }
}

function mapCellValue(value: unknown): TableRow[string] {
    if (value === undefined || value === null) return null
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value
    }
    if (Array.isArray(value)) {
        return value as unknown[]
    }
    if (typeof value === 'object') {
        return value as Record<string, unknown>
    }
    return String(value)
}

function mapRow(wire: unknown): TableRow {
    const row = asRecord(wire)
    if (!row) return {}
    const out: TableRow = {}
    for (const [key, value] of Object.entries(row)) {
        out[key] = mapCellValue(value)
    }
    return out
}

function mapTableData(wire: TableDataResultDto): TableDataResult {
    const columns = Array.isArray(wire.columns) ? wire.columns.map(mapColumn) : []
    const rows = Array.isArray(wire.rows) ? wire.rows.map(mapRow) : []
    return {
        columns,
        rows,
        cursorId: wire.cursorId,
        hasMore: wire.hasMore,
        pageOffset: wire.pageOffset,
        pageSize: wire.pageSize,
    }
}

function mapAuditRow(wire: unknown): Record<string, string | number | boolean | null> | undefined {
    const row = asRecord(wire)
    if (!row) return undefined
    const out: Record<string, string | number | boolean | null> = {}
    for (const [key, value] of Object.entries(row)) {
        if (value === undefined || value === null) {
            out[key] = null
        } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            out[key] = value
        } else {
            out[key] = String(value)
        }
    }
    return out
}

function mapAuditEntry(wire: TableDataChangeAuditEntryDto): TableDataChangeAuditEntry {
    return {
        id: String(wire.id ?? ''),
        createdAtMs: Number(wire.createdAtMs ?? 0),
        operation: String(wire.operation ?? '') as TableDataChangeAuditEntry['operation'],
        beforeRow: wire.beforeRow != null ? mapAuditRow(wire.beforeRow) : undefined,
        afterRow: wire.afterRow != null ? mapAuditRow(wire.afterRow) : undefined,
        primaryKey: wire.primaryKey != null ? mapAuditRow(wire.primaryKey) : undefined,
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
