import type {TreeNode} from '@/core/types'
import {findAncestorByType} from '@/core/utils/tree'
import {
    resolveExplorerSqlFileScope,
} from '@/features/explorer/services/explorer-database-scope'
import {
    activateOrCreateConsoleTab,
    applySqlToConsoleTab,
    buildSqlFileOpenKey,
    withSqlConsoleOpenGuard,
} from '@/features/explorer/services/sql-console-open.service'
import {openLatestSqlEditor} from '@/features/explorer/services/sql-editor-actions.service'
import {resolveConsoleTabTitle} from '@/features/workspace/services/console-tab-title'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {t} from '@/i18n'
import {instanceSqlApi} from '@/api'

/** 打开实例控制台：优先加载 workspaces 下最近保存的 .sql */
export async function openInstanceConsole(options: {
    tree: TreeNode[]
    connectionId: string
    connectionName?: string
    databaseNode: Pick<TreeNode, 'id' | 'label'>
}) {
    await openLatestSqlEditor(options.tree, options.databaseNode, options.connectionName)
}

/** 打开 workspaces 目录下的指定 SQL 文件（双击脚本 / 右键打开） */
export async function openSqlFileFromTree(tree: TreeNode[], node: TreeNode) {
    const connectionId = findAncestorByType(tree, node.id, 'connection')?.id
    const scope = resolveExplorerSqlFileScope(tree, node.id)
    if (!connectionId || !scope) return false

    const connectionName = findAncestorByType(tree, node.id, 'connection')?.label
    const guardKey = buildSqlFileOpenKey(connectionId, scope.instanceLabel, node.label)

    return withSqlConsoleOpenGuard(guardKey, async () => {
        const tabId = await activateOrCreateConsoleTab({
            connectionId,
            connectionName,
            instanceId: scope.scopeNode.id,
            database: scope.instanceLabel,
            sqlFile: node.label,
            explorerNodeId: node.id,
            title: resolveConsoleTabTitle({
                connectionName,
                sqlFile: node.label,
                kind: 'script',
            }),
        })

        void (async () => {
            try {
                const result = await instanceSqlApi.read({
                    connectionId,
                    instanceName: scope.instanceLabel,
                    fileName: node.label,
                })
                applySqlToConsoleTab(tabId, result.sql, {
                    sqlFile: node.label,
                    connectionName,
                    explorerNodeId: node.id,
                })
            } catch {
                useLayoutStore().showErrorToast(t('console.loadSqlFileFailed'))
            }
        })()

        return true
    }).then((result) => result ?? false)
}
