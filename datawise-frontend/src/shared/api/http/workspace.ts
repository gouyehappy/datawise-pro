import type {
    InstanceSqlFileItem,
    InstanceSqlHistoryEntry,
    ListInstanceSqlScriptsPayload,
    DeleteInstanceSqlPayload,
    ReadInstanceSqlPayload,
    ReadInstanceSqlHistoryPayload,
    ReadInstanceSqlResult,
    RenameInstanceSqlPayload,
    RestoreInstanceSqlHistoryPayload,
    SaveInstanceSqlResult,
    WorkspaceApi,
    WorkspaceSettings,
} from '@/shared/api/types'
import type {ExportTask, SavedConsole, SqlLogEntry} from '@/core/types'
import {postJson, getJson, putJson, deleteJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

export function createHttpWorkspaceApi(): WorkspaceApi {
    return {
        fetchSqlLogs: () => getJson<SqlLogEntry[]>(API_PATHS.workspace.sqlLogs),

        appendSqlLog: (entry, connectionId) =>
            postJson<SqlLogEntry>(
                API_PATHS.workspace.sqlLogs,
                {
                    ...entry,
                    connectionId,
                    database: entry.database,
                },
                {silent: true},
            ),

        fetchSavedConsoles: () => getJson<SavedConsole[]>(API_PATHS.workspace.savedConsoles),

        saveConsole: (payload) =>
            postJson<SavedConsole>(API_PATHS.workspace.savedConsoles, payload),

        saveInstanceSql: (payload) =>
            postJson<SaveInstanceSqlResult>(API_PATHS.workspace.instanceSql, payload),

        readInstanceSql: ({connectionId, instanceName, fileName = 'console.sql'}) => {
            const params = new URLSearchParams({
                connectionId,
                instanceName,
                fileName,
            })
            return getJson<ReadInstanceSqlResult>(`${API_PATHS.workspace.instanceSql}?${params}`)
        },

        readLatestInstanceSql: ({connectionId, instanceName}) => {
            const params = new URLSearchParams({
                connectionId,
                instanceName,
            })
            return getJson<ReadInstanceSqlResult>(`${API_PATHS.workspace.instanceSqlLatest}?${params}`)
        },

        renameInstanceSql: (payload: RenameInstanceSqlPayload) =>
            putJson<SaveInstanceSqlResult>(API_PATHS.workspace.instanceSqlRename, payload),

        deleteInstanceSql: ({connectionId, instanceName, fileName}: DeleteInstanceSqlPayload) => {
            const params = new URLSearchParams({
                connectionId,
                instanceName,
                fileName,
            })
            return deleteJson<void>(`${API_PATHS.workspace.instanceSql}?${params}`)
        },

        listInstanceSqlScripts: ({
                                     connectionId,
                                     instanceName,
                                     allConnections = false,
                                 }: ListInstanceSqlScriptsPayload) => {
            const params = new URLSearchParams({
                connectionId,
                instanceName,
                allConnections: allConnections ? 'true' : 'false',
            })
            return getJson<InstanceSqlFileItem[]>(`${API_PATHS.workspace.instanceSqlScripts}?${params}`)
        },

        listInstanceSqlHistory: ({connectionId, instanceName, fileName = 'console.sql'}) => {
            const params = new URLSearchParams({
                connectionId,
                instanceName,
                fileName,
            })
            return getJson<InstanceSqlHistoryEntry[]>(`${API_PATHS.workspace.instanceSqlHistory}?${params}`)
        },

        readInstanceSqlHistoryVersion: ({
            connectionId,
            instanceName,
            fileName = 'console.sql',
            versionId,
        }: ReadInstanceSqlHistoryPayload) => {
            const params = new URLSearchParams({
                connectionId,
                instanceName,
                fileName,
                versionId,
            })
            return getJson<ReadInstanceSqlResult>(`${API_PATHS.workspace.instanceSqlHistoryVersion}?${params}`)
        },

        restoreInstanceSqlHistory: (payload: RestoreInstanceSqlHistoryPayload) =>
            postJson<ReadInstanceSqlResult>(API_PATHS.workspace.instanceSqlHistoryRestore, payload),

        saveViewModel: (payload) =>
            postJson<import('@/shared/api/types').SaveViewModelResult>(API_PATHS.workspace.viewModels, payload),

        saveViewModelDraft: (payload) =>
            postJson<import('@/shared/api/types').SaveViewModelResult>(
                API_PATHS.workspace.viewModelsDraft,
                payload,
            ),

        readViewModel: ({connectionId, instanceName, name}) => {
            const params = new URLSearchParams({connectionId, instanceName, name})
            return getJson<import('@/shared/api/types').ReadViewModelResult>(
                `${API_PATHS.workspace.viewModels}?${params}`,
            )
        },

        listViewModels: ({connectionId, instanceName}) => {
            const params = new URLSearchParams({connectionId, instanceName})
            return getJson<import('@/shared/api/types').ViewModelFileItem[]>(
                `${API_PATHS.workspace.viewModelsScripts}?${params}`,
            )
        },

        renameViewModel: (payload) =>
            putJson<import('@/shared/api/types').SaveViewModelResult>(
                API_PATHS.workspace.viewModelsRename,
                payload,
            ),

        deleteViewModel: ({connectionId, instanceName, name}) => {
            const params = new URLSearchParams({connectionId, instanceName, name})
            return deleteJson<void>(`${API_PATHS.workspace.viewModels}?${params}`)
        },

        fetchWorkspaceSettings: () => getJson<WorkspaceSettings>(API_PATHS.workspace.settings),

        fetchExportTasks: () => getJson<ExportTask[]>(API_PATHS.workspace.exportTasks),

        createExportTask: (fileName, options) =>
            postJson<ExportTask>(API_PATHS.workspace.exportTasks, {
                fileName,
                clientCompleted: options?.clientCompleted,
                fileSize: options?.fileSize,
            }),

        fetchSqlStats: async (query = {}) => {
            const params = new URLSearchParams()
            if (query.connectionId?.trim()) params.set('connectionId', query.connectionId.trim())
            if (query.days != null) params.set('days', String(query.days))
            if (query.limit != null) params.set('limit', String(query.limit))
            if (query.slowThresholdMs != null) params.set('slowThresholdMs', String(query.slowThresholdMs))
            const suffix = params.toString()
            const path = suffix ? `${API_PATHS.workspace.sqlStats}?${suffix}` : API_PATHS.workspace.sqlStats
            return getJson(path)
        },
    }
}
