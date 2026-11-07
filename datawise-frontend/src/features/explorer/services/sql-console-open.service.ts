import type {WorkspaceTab} from '@/core/types'
import {resolveConsoleTabTitle} from '@/features/workspace/services/console-tab-title'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'

const inflightOpens = new Set<string>()

/** 同一目标短时间只发起一次打开，避免双击触发多次 API + 多个 Tab */
export function withSqlConsoleOpenGuard<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (inflightOpens.has(key)) return Promise.resolve(undefined)
    inflightOpens.add(key)
    return fn()
        .catch((error) => {
            throw error
        })
        .finally(() => {
            inflightOpens.delete(key)
        })
}

export function buildSqlFileOpenKey(
    connectionId: string,
    instanceName: string,
    fileName: string,
): string {
    return `${connectionId}:${instanceName}:${fileName}`
}

export function applySqlToConsoleTab(
    tabId: string,
    sql: string,
    options?: {
        sqlFile?: string
        connectionName?: string
        connectionHost?: string
        explorerNodeId?: string
    },
): WorkspaceTab | null {
    const workspace = useWorkspaceStore()
    const tab = workspace.tabs.find((item) => item.id === tabId)
    if (!tab || tab.type !== 'console') return null

    tab.sql = sql
    tab.savedSql = sql
    if (options?.explorerNodeId) tab.explorerNodeId = options.explorerNodeId
    if (options?.sqlFile) {
        tab.sqlFile = options.sqlFile
        const nextTitle = resolveConsoleTabTitle({
            connectionName: options.connectionName,
            connectionHost: options.connectionHost,
            sqlFile: options.sqlFile,
            kind: 'script',
        })
        if (nextTitle) tab.title = nextTitle
    }
    return tab
}

export async function activateOrCreateConsoleTab(options: {
    connectionId: string
    connectionName?: string
    instanceId: string
    database: string
    sql?: string
    sqlFile?: string
    explorerNodeId?: string
    title?: string
    connectionHost?: string
    /** 打开最近脚本时由 loadLatest 绑定 sqlFile，避免与 ensureConsoleTabScriptFile 竞态 */
    skipEnsureScriptFile?: boolean
}): Promise<string> {
    const workspace = useWorkspaceStore()
    const title =
        options.title ??
        (options.sqlFile
            ? resolveConsoleTabTitle({
                connectionHost: options.connectionHost,
                connectionName: options.connectionName,
                sqlFile: options.sqlFile,
                kind: 'script',
            })
            : undefined)

    return workspace.openConsole({
        connectionId: options.connectionId,
        connectionName: options.connectionName,
        instanceId: options.instanceId,
        database: options.database,
        sql: options.sql ?? '',
        sqlFile: options.sqlFile,
        explorerNodeId: options.explorerNodeId,
        title,
        skipEnsureScriptFile: options.skipEnsureScriptFile,
    })
}
