import {api} from '@/shared/api'
import type {SqlLogEntry} from '@/core/types'
import type {SqlStatsQuery} from '@/shared/api/types'

/** 工作区侧栏：SQL 日志、已保存控制台、导出任务与统计 */
export const workspacePanelApi = {
    fetchSqlLogs: () => api.workspace.fetchSqlLogs(),
    appendSqlLog: (entry: Omit<SqlLogEntry, 'id'>, connectionId?: string) =>
        api.workspace.appendSqlLog(entry, connectionId),
    fetchSavedConsoles: () => api.workspace.fetchSavedConsoles(),
    saveConsole: (payload: {
        name: string
        connectionName: string
        sql: string
        folder?: string
        tags?: string[]
    }) => api.workspace.saveConsole(payload),
    fetchExportTasks: () => api.workspace.fetchExportTasks(),
    createExportTask: (
        fileName: string,
        options?: { clientCompleted?: boolean; fileSize?: number },
    ) => api.workspace.createExportTask(fileName, options),
    fetchSqlStats: (query?: SqlStatsQuery) => api.workspace.fetchSqlStats(query),
}
