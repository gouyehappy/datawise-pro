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
import {readSqlScriptContent} from '@/features/explorer/services/sql-script-content.service'
import {resolveConsoleTabTitle} from '@/features/workspace/services/console-tab-title'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {t} from '@/i18n'

/** 打开实例控制台：优先加载 workspaces 下最近保存的 .sql */
export async function openInstanceConsole(options: {
    tree: TreeNode[]
    connectionId: string
    connectionName?: string
    databaseNode: Pick<TreeNode, 'id' | 'label'>
}) {
    await openLatestSqlEditor(options.tree, options.databaseNode, options.connectionName)
}

/** 打开 workspaces / scripts 目录下的指定 SQL 文件（双击脚本 / 右键打开） */
export async function openSqlFileFromTree(tree: TreeNode[], node: TreeNode) {
    const connectionId = findAncestorByType(tree, node.id, 'connection')?.id
    const scope = resolveExplorerSqlFileScope(tree, node.id)
    if (!connectionId || !scope) return false

    const connectionName = findAncestorByType(tree, node.id, 'connection')?.label
    const guardKey = buildSqlFileOpenKey(connectionId, scope.instanceLabel, node.label)

    return withSqlConsoleOpenGuard(guardKey, async () => {
        // Cache-first read, then open — avoids empty/"init" flash; prefetch makes this sync.
        let sql = ''
        let fileName = node.label
        try {
            const result = await readSqlScriptContent({
                connectionId,
                instanceName: scope.instanceLabel,
                fileName: node.label,
            })
            sql = result.sql
            fileName = result.fileName
        } catch {
            useLayoutStore().showErrorToast(t('console.loadSqlFileFailed'))
            return false
        }

        const jdbcDatabase = scope.instanceLabel === '_scripts' || scope.instanceLabel === '_connection'
            ? ''
            : scope.instanceLabel

        const tabId = await activateOrCreateConsoleTab({
            connectionId,
            connectionName,
            instanceId: scope.scopeNode.id,
            database: jdbcDatabase,
            sql,
            sqlFile: fileName,
            explorerNodeId: node.id,
            skipEnsureScriptFile: true,
            title: resolveConsoleTabTitle({
                connectionName,
                sqlFile: fileName,
                kind: 'script',
            }),
        })

        applySqlToConsoleTab(tabId, sql, {
            sqlFile: fileName,
            connectionName,
            explorerNodeId: node.id,
        })

        return true
    }).then((result) => result ?? false)
}
