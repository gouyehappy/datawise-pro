import type {DbType} from '@/core/types'
import {sqlApi} from '@/api'
import {t} from '@/i18n'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {wrapExplainSql} from '@/features/workspace/services/explain-plan.service'
import {
    buildErrorQueryResultItem,
    buildSuccessQueryResultItem,
} from '@/features/workspace/services/query-result-item'
import {resolveSqlPageSize, resolveClientMaxResultRows} from '@/features/settings/services/query-limit.service'
import {buildConnectionCapabilities} from '@/shared/capabilities/db-type-capabilities'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {registerConnectionHealthCheck} from '@/features/explorer/services/register-connection-health.service'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

export type SessionSqlOpenMode = 'open' | 'explain'

export interface OpenMonitorSessionSqlOptions {
    sql: string
    mode: SessionSqlOpenMode
    connectionId?: string
    database?: string
    dbType?: DbType
}

export async function openMonitorSessionSql(options: OpenMonitorSessionSqlOptions): Promise<void> {
    const trimmed = options.sql.trim()
    if (!trimmed) return

    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()
    const appConfig = useAppConfigStore()

    layout.setModule('database')

    const tabId = await workspace.openConsole({
        connectionId: options.connectionId,
        database: options.database,
        sql: trimmed,
    })

    if (options.mode === 'open') return

    if (!usePluginStore().isEnabled('p-explain-plan')) return

    const connectionId = options.connectionId?.trim()
    if (!connectionId) {
        layout.showErrorToast(t('shortcut.sessionSql.connectionRequired'))
        return
    }

    const catalogStore = useDatasourceCatalogStore()
    await catalogStore.ensureLoaded().catch(() => undefined)
    const caps = buildConnectionCapabilities(options.dbType, catalogStore.items)
    if (!caps.sqlExplain) {
        layout.showErrorToast(t('capabilities.unsupported.sqlExplain'))
        return
    }

    const explainSql = wrapExplainSql(trimmed, options.dbType)
    const pageSize = resolveSqlPageSize()
    const maxRows = resolveClientMaxResultRows()

    try {
        const result = await sqlApi.execute(explainSql, {
            connectionId,
            database: options.database,
            pageSize,
            maxRows: maxRows > 0 ? maxRows : undefined,
            sessionKey: tabId,
        })
        registerConnectionHealthCheck(connectionId, 'ok')
        const item = buildSuccessQueryResultItem(result, 0, explainSql, options.dbType)
        workspace.setConsoleQueryResults(tabId, [item])
        workspace.setExecutionResult(result.rowCount, result.durationMs)
        appConfig.setShowConsoleResultPanel(true)
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'console.runFailed')
        const item = buildErrorQueryResultItem(
            {sql: explainSql, errorMessage: message},
            0,
        )
        workspace.setConsoleQueryResults(tabId, [item])
        appConfig.setShowConsoleResultPanel(true)
        layout.showErrorToast(message)
    }
}
