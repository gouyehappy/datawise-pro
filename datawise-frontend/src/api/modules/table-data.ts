import {api} from '@/shared/api'
import type {TableDataFetchOptions} from '@/shared/api/types'

export const tableDataApi = {
    fetch: (tableName: string, options?: TableDataFetchOptions) =>
        api.tableData.fetch(tableName, options),
    insertRow: (
        tableName: string,
        request: Parameters<typeof api.tableData.insertRow>[1],
    ) => api.tableData.insertRow(tableName, request),
    updateRow: (
        tableName: string,
        request: Parameters<typeof api.tableData.updateRow>[1],
    ) => api.tableData.updateRow(tableName, request),
    deleteRow: (
        tableName: string,
        request: Parameters<typeof api.tableData.deleteRow>[1],
    ) => api.tableData.deleteRow(tableName, request),
    listAudit: (
        tableName: string,
        options: Parameters<typeof api.tableData.listAudit>[1],
    ) => api.tableData.listAudit(tableName, options),
    restoreAudit: (
        tableName: string,
        auditId: string,
        request: Parameters<typeof api.tableData.restoreAudit>[2],
    ) => api.tableData.restoreAudit(tableName, auditId, request),
}
