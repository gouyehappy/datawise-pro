import {api} from '@/shared/api'
import type {
    DeleteInstanceSqlPayload,
    ListInstanceSqlScriptsPayload,
    ReadInstanceSqlPayload,
    ReadInstanceSqlHistoryPayload,
    RenameInstanceSqlPayload,
    RestoreInstanceSqlHistoryPayload,
    SaveInstanceSqlPayload,
} from '@/shared/api/types'
import {nextScriptFileName} from '@/features/explorer/services/sql-script-naming'

/** 实例 workspaces：SQL 脚本读写与列表 */
export const instanceSqlApi = {
    listScripts: (payload: ListInstanceSqlScriptsPayload) =>
        api.workspace.listInstanceSqlScripts(payload),

    save: (payload: SaveInstanceSqlPayload) => api.workspace.saveInstanceSql(payload),

    read: (payload: ReadInstanceSqlPayload) => api.workspace.readInstanceSql(payload),

    readLatest: (payload: Omit<ReadInstanceSqlPayload, 'fileName'>) =>
        api.workspace.readLatestInstanceSql(payload),

    rename: (payload: RenameInstanceSqlPayload) => api.workspace.renameInstanceSql(payload),

    delete: (payload: DeleteInstanceSqlPayload) => api.workspace.deleteInstanceSql(payload),

    listHistory: (payload: ReadInstanceSqlPayload) => api.workspace.listInstanceSqlHistory(payload),

    readHistoryVersion: (payload: ReadInstanceSqlHistoryPayload) =>
        api.workspace.readInstanceSqlHistoryVersion(payload),

    restoreHistoryVersion: (payload: RestoreInstanceSqlHistoryPayload) =>
        api.workspace.restoreInstanceSqlHistory(payload),

    async resolveNextScriptFile(options: { connectionId: string; instanceName: string }) {
        const files = await api.workspace.listInstanceSqlScripts({
            connectionId: options.connectionId,
            instanceName: options.instanceName,
        })
        return nextScriptFileName(files)
    },

    createEmptyScript(options: {
        connectionId: string
        instanceId?: string
        instanceName: string
        fileName: string
    }) {
        return api.workspace.saveInstanceSql({
            connectionId: options.connectionId,
            instanceId: options.instanceId,
            instanceName: options.instanceName,
            sql: '',
            fileName: options.fileName,
        })
    },
}
