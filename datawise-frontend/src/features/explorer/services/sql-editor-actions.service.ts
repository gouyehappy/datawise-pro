import type {TreeNode} from '@/core/types'
import {findAncestorByType} from '@/core/utils/tree'
import {fetchConnectionHost} from '@/features/explorer/services/resolve-connection-host'
import {resolveExplorerInstanceLabel} from '@/features/explorer/services/explorer-database-scope'
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
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {t} from '@/i18n'
import {instanceSqlApi} from '@/api'

export interface DatabaseConsoleContext {
    connectionId: string
    connectionName?: string
    connectionHost?: string
    databaseNode: Pick<TreeNode, 'id' | 'label'>
}

/** 从 Explorer 树同步解析控制台上下文，避免打开前等待 catalog API */
export function resolveDatabaseConsoleContextSync(
    tree: TreeNode[],
    databaseNode: Pick<TreeNode, 'id' | 'label'>,
    connectionName?: string,
): DatabaseConsoleContext | null {
    const connection = findAncestorByType(tree, databaseNode.id, 'connection')
    const connectionId = connection?.id
    if (!connectionId) return null
    const instanceLabel =
        resolveExplorerInstanceLabel(tree, databaseNode.id, connection?.dbType) ?? databaseNode.label
    return {
        connectionId,
        connectionName: connectionName ?? connection?.label,
        databaseNode: {id: databaseNode.id, label: instanceLabel},
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
            database: ctx.databaseNode.label,
            explorerNodeId: ctx.databaseNode.id,
            skipEnsureScriptFile: true,
        })
        await loadLatestSqlIntoTab(ctx, placeholderTabId)
    })
}

/** 打开指定 workspaces SQL 脚本 */
export async function openSqlScriptFile(
    ctx: DatabaseConsoleContext,
    fileName: string,
) {
    const guardKey = buildSqlFileOpenKey(ctx.connectionId, ctx.databaseNode.label, fileName)
    return withSqlConsoleOpenGuard(guardKey, async () => {
        const tabId = await activateOrCreateConsoleTab({
            connectionId: ctx.connectionId,
            connectionName: ctx.connectionName,
            connectionHost: ctx.connectionHost,
            instanceId: ctx.databaseNode.id,
            database: ctx.databaseNode.label,
            sqlFile: fileName,
        })

        void (async () => {
            try {
                const result = await instanceSqlApi.read({
                    connectionId: ctx.connectionId,
                    instanceName: ctx.databaseNode.label,
                    fileName,
                })
                applySqlToConsoleTab(tabId, result.sql, {
                    sqlFile: result.fileName,
                    connectionName: ctx.connectionName,
                    connectionHost: ctx.connectionHost,
                })
            } catch {
                useLayoutStore().showErrorToast(t('console.loadSqlFileFailed'))
            }
        })()
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
            database: ctx.databaseNode.label,
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
            database: ctx.databaseNode.label,
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
