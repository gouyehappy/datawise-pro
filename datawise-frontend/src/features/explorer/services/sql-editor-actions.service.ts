import type {TreeNode} from '@/core/types'
import {findAncestorByType} from '@/core/utils/tree'
import {fetchConnectionHost} from '@/features/explorer/services/resolve-connection-host'
import {resolveExplorerInstanceLabel} from '@/features/explorer/services/explorer-database-scope'
import {isCatalogSchemaDbType} from '@/features/explorer/services/explorer-lazy-load'
import {
    createEmptySqlScript,
    resolveNextScriptFileForOpen,
} from '@/features/explorer/services/sql-script.service'
import {
    activateOrCreateConsoleTab,
    applySqlToConsoleTab,
    buildSqlFileOpenKey,
    withSqlConsoleOpenGuard,
} from '@/features/explorer/services/sql-console-open.service'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {
    getBoundConsoleSqlFile,
    resolveConsoleTabTitle,
} from '@/features/workspace/services/console-tab-title'
import {
    findConnectionScriptsFolder,
    isConnectionScriptsInstance,
    TRINO_CONNECTION_SCRIPTS_INSTANCE,
} from '@/features/workspace/services/console-workspace-instance'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {t} from '@/i18n'
import {instanceSqlApi} from '@/api'
import {readSqlScriptContent} from '@/features/explorer/services/sql-script-content.service'
import {setCachedSqlScript} from '@/features/explorer/services/sql-script-content-cache'

export interface DatabaseConsoleContext {
    connectionId: string
    connectionName?: string
    connectionHost?: string
    /** 脚本落盘 scope（Trino 族固定为连接级 scripts） */
    databaseNode: Pick<TreeNode, 'id' | 'label'>
    /** JDBC catalog.schema；与脚本目录解耦，可为 undefined */
    jdbcDatabase?: string
}

/** 从 Explorer 树同步解析控制台上下文，避免打开前等待 catalog API */
export function resolveDatabaseConsoleContextSync(
    tree: TreeNode[],
    databaseNode: Pick<TreeNode, 'id' | 'label'>,
    connectionName?: string,
): DatabaseConsoleContext | null {
    const connection = findAncestorByType(tree, databaseNode.id, 'connection')
    const connectionId = connection?.id
    if (!connectionId || !connection) return null

    const scopedLabel =
        resolveExplorerInstanceLabel(tree, databaseNode.id, connection.dbType) ?? databaseNode.label

    // 跨 catalog 引擎：脚本一律进连接级 scripts；JDBC 仍可用原 catalog.schema
    if (isCatalogSchemaDbType(connection.dbType)) {
        const scriptsFolder = findConnectionScriptsFolder(connection)
        const jdbcDatabase = isConnectionScriptsInstance(scopedLabel) ? undefined : scopedLabel
        return {
            connectionId,
            connectionName: connectionName ?? connection.label,
            databaseNode: {
                id: scriptsFolder?.id ?? databaseNode.id,
                label: TRINO_CONNECTION_SCRIPTS_INSTANCE,
            },
            jdbcDatabase,
        }
    }

    return {
        connectionId,
        connectionName: connectionName ?? connection.label,
        databaseNode: {id: databaseNode.id, label: scopedLabel},
        jdbcDatabase: scopedLabel,
    }
}

async function resolveDatabaseConsoleContext(
    tree: TreeNode[],
    databaseNode: Pick<TreeNode, 'id' | 'label'>,
    connectionName?: string,
): Promise<DatabaseConsoleContext | null> {
    const ctx = resolveDatabaseConsoleContextSync(tree, databaseNode, connectionName)
    if (!ctx) return null
    const connectionHost = await fetchConnectionHost(ctx.connectionId, ctx.connectionName)
    return {...ctx, connectionHost}
}

async function loadLatestSqlIntoTab(ctx: DatabaseConsoleContext, placeholderTabId: string) {
    const workspace = useWorkspaceStore()

    function closeSiblingPlaceholders(keepTabId: string) {
        for (const item of [...workspace.tabs]) {
            if (
                item.id !== keepTabId
                && item.type === 'console'
                && item.connectionId === ctx.connectionId
                && item.instanceId === ctx.databaseNode.id
                && !getBoundConsoleSqlFile(item)
            ) {
                workspace.closeTab(item.id)
            }
        }
    }

    try {
        const result = await instanceSqlApi.readLatest({
            connectionId: ctx.connectionId,
            instanceName: ctx.databaseNode.label,
        })
        if (!result.relativePath) {
            closeSiblingPlaceholders(placeholderTabId)
            return
        }
        setCachedSqlScript(
            {
                connectionId: ctx.connectionId,
                instanceName: ctx.databaseNode.label,
                fileName: result.fileName,
            },
            result.sql,
        )

        const existing = workspace.tabs.find(
            (item) =>
                item.type === 'console'
                && item.connectionId === ctx.connectionId
                && item.instanceId === ctx.databaseNode.id
                && item.sqlFile === result.fileName
                && item.id !== placeholderTabId,
        )
        if (existing) {
            existing.sql = result.sql
            existing.savedSql = result.sql
            workspace.activeTabId = existing.id
            closeSiblingPlaceholders(existing.id)
            workspace.closeTab(placeholderTabId)
            return
        }

        const placeholder = workspace.tabs.find((item) => item.id === placeholderTabId)
        if (!placeholder || placeholder.type !== 'console') return
        if (getBoundConsoleSqlFile(placeholder) === result.fileName) {
            placeholder.sql = result.sql
            placeholder.savedSql = result.sql
            closeSiblingPlaceholders(placeholderTabId)
            return
        }
        applySqlToConsoleTab(placeholderTabId, result.sql, {
            sqlFile: result.fileName,
            connectionName: ctx.connectionName,
            connectionHost: ctx.connectionHost,
        })
        closeSiblingPlaceholders(placeholderTabId)
    } catch {
        // keep placeholder tab
    }
}

/** SQL 编辑器：打开最近修改的脚本（F3 / 双击数据库） */
export async function openLatestSqlEditor(
    tree: TreeNode[],
    databaseNode: Pick<TreeNode, 'id' | 'label'>,
    connectionName?: string,
) {
    const ctx = resolveDatabaseConsoleContextSync(tree, databaseNode, connectionName)
    if (!ctx) return

    const guardKey = `${ctx.connectionId}:${ctx.databaseNode.label}:latest`
    return withSqlConsoleOpenGuard(guardKey, async () => {
        const placeholderTabId = await activateOrCreateConsoleTab({
            connectionId: ctx.connectionId,
            connectionName: ctx.connectionName,
            instanceId: ctx.databaseNode.id,
            database: ctx.jdbcDatabase ?? '',
            explorerNodeId: ctx.databaseNode.id,
            skipEnsureScriptFile: true,
        })
        await loadLatestSqlIntoTab(ctx, placeholderTabId)
    })
}

/** 打开指定 workspaces / scripts SQL 脚本 */
export async function openSqlScriptFile(
    ctx: DatabaseConsoleContext,
    fileName: string,
) {
    const guardKey = buildSqlFileOpenKey(ctx.connectionId, ctx.databaseNode.label, fileName)
    return withSqlConsoleOpenGuard(guardKey, async () => {
        let sql = ''
        let resolvedName = fileName
        try {
            const result = await readSqlScriptContent({
                connectionId: ctx.connectionId,
                instanceName: ctx.databaseNode.label,
                fileName,
            })
            sql = result.sql
            resolvedName = result.fileName
        } catch {
            useLayoutStore().showErrorToast(t('console.loadSqlFileFailed'))
            return
        }

        const tabId = await activateOrCreateConsoleTab({
            connectionId: ctx.connectionId,
            connectionName: ctx.connectionName,
            connectionHost: ctx.connectionHost,
            instanceId: ctx.databaseNode.id,
            database: ctx.jdbcDatabase ?? '',
            sql,
            sqlFile: resolvedName,
            skipEnsureScriptFile: true,
        })

        applySqlToConsoleTab(tabId, sql, {
            sqlFile: resolvedName,
            connectionName: ctx.connectionName,
            connectionHost: ctx.connectionHost,
        })
    })
}

/** 新建 SQL 编辑器（落到连接实例工作区 scripts，Explorer「工作区」可见） */
export async function createNewSqlEditor(
    tree: TreeNode[],
    databaseNode: Pick<TreeNode, 'id' | 'label'>,
    connectionName?: string,
) {
    const ctx = resolveDatabaseConsoleContextSync(tree, databaseNode, connectionName)
    if (!ctx) return

    const workspace = useWorkspaceStore()

    const fileName = await resolveNextScriptFileForOpen({
        tabs: workspace.tabs,
        connectionId: ctx.connectionId,
        instanceId: ctx.databaseNode.id,
        instanceName: ctx.databaseNode.label,
        tree,
    })

    const guardKey = buildSqlFileOpenKey(ctx.connectionId, ctx.databaseNode.label, fileName)
    return withSqlConsoleOpenGuard(guardKey, async () => {
        await activateOrCreateConsoleTab({
            connectionId: ctx.connectionId,
            connectionName: ctx.connectionName,
            instanceId: ctx.databaseNode.id,
            database: ctx.jdbcDatabase ?? '',
            sql: '',
            sqlFile: fileName,
            explorerNodeId: ctx.databaseNode.id,
        })

        const explorer = useExplorerStore()
        const layout = useLayoutStore()
        void (async () => {
            try {
                await createEmptySqlScript({
                    connectionId: ctx.connectionId,
                    instanceId: ctx.databaseNode.id,
                    instanceName: ctx.databaseNode.label,
                    fileName,
                })
                setCachedSqlScript(
                    {
                        connectionId: ctx.connectionId,
                        instanceName: ctx.databaseNode.label,
                        fileName,
                    },
                    '',
                )
                void explorer.reloadWorkspacesFolder(
                    ctx.connectionId,
                    ctx.databaseNode.label,
                    ctx.databaseNode.id,
                )
            } catch {
                layout.showErrorToast(t('console.loadSqlFileFailed'))
            }
        })()
    })
}

/** 打开空白 SQL 控制台（首次保存时创建脚本文件） */
export async function openBlankSqlConsole(
    tree: TreeNode[],
    databaseNode: Pick<TreeNode, 'id' | 'label'>,
    connectionName?: string,
) {
    const ctx = resolveDatabaseConsoleContextSync(tree, databaseNode, connectionName)
    if (!ctx) return

    const guardKey = `${ctx.connectionId}:${ctx.databaseNode.label}:blank`
    return withSqlConsoleOpenGuard(guardKey, async () => {
        await activateOrCreateConsoleTab({
            connectionId: ctx.connectionId,
            connectionName: ctx.connectionName,
            instanceId: ctx.databaseNode.id,
            database: ctx.jdbcDatabase ?? '',
            explorerNodeId: ctx.databaseNode.id,
        })
    })
}

export async function buildDatabaseConsoleContext(
    tree: TreeNode[],
    databaseNode: Pick<TreeNode, 'id' | 'label'>,
    connectionName?: string,
) {
    return resolveDatabaseConsoleContext(tree, databaseNode, connectionName)
}
