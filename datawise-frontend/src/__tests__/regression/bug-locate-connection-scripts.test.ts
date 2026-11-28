import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildExplorerScopedLabelResolver,
    resolveConsoleInstanceLabel,
} from '../../features/workspace/services/resolve-console-instance.ts'
import {resolveActiveTabLocateNodeId} from '../../features/explorer/services/explorer-locate.service.ts'
import {buildWorkspaceSqlFileNodeId} from '../../features/explorer/services/workspace-sql-file-node-id.ts'
import type {TreeNode, WorkspaceTab} from '@/core/types'

describe('locate console tab saved in connection-level scripts', () => {
    const scriptsFolderId = 'scripts-folder-1'
    const devSqlNodeId = buildWorkspaceSqlFileNodeId('trino-conn', '_scripts', 'dev.sql')

    const scriptsFolder: TreeNode = {
        id: scriptsFolderId,
        label: 'scripts',
        type: 'folder',
        expanded: false,
        children: [
            {id: devSqlNodeId, label: 'dev.sql', type: 'sql_file', expanded: false, children: []},
        ],
    }

    // Trino 连接（catalog-schema 引擎），连接根下挂 scripts 文件夹。
    const connection: TreeNode = {
        id: 'trino-conn',
        label: 'Trino@test-host',
        type: 'connection',
        dbType: 'trino',
        expanded: true,
        children: [scriptsFolder],
    }
    const tree: TreeNode[] = [connection]

    const findNode = (id: string): TreeNode | null => {
        const walk = (nodes: TreeNode[]): TreeNode | null => {
            for (const node of nodes) {
                if (node.id === id) return node
                const found = node.children ? walk(node.children) : null
                if (found) return found
            }
            return null
        }
        return walk(tree)
    }

    const tab: WorkspaceTab = {
        id: 'c-dev',
        title: '<test-host> dev',
        type: 'console',
        closable: true,
        connectionId: 'trino-conn',
        // 保存链路把 Trino 控制台脚本落到连接级 scripts：instanceId = scripts 文件夹，database 清空。
        instanceId: scriptsFolderId,
        database: undefined,
        sqlFile: 'dev.sql',
    }

    const makeOptions = () => ({
        findNode,
        findDatabaseNode: (
            connectionId: string,
            instanceLabel: string,
            _instanceId?: string | null,
        ): TreeNode | null => {
            const conn = findNode(connectionId)
            if (conn && (instanceLabel === '_scripts' || /^scripts$/i.test(instanceLabel))) {
                return conn.children?.find(
                    (n) => n.type === 'folder' && /^scripts$/i.test(n.label),
                ) ?? null
            }
            return null
        },
        findNodeLabel: (id: string) => findNode(id)?.label,
        findTableNodeGlobal: () => null,
        resolveScopedLabel: buildExplorerScopedLabelResolver(tree, findNode),
    })

    it('resolver keeps _scripts only in locate mode', () => {
        const scoped = buildExplorerScopedLabelResolver(tree, findNode)
        assert.equal(scoped(scriptsFolderId), '_scripts')

        const shared = {
            tabInstanceId: tab.instanceId,
            tabDatabase: tab.database,
            findNodeLabel: (id: string) => findNode(id)?.label,
            resolveScopedLabel: scoped,
        }
        // 默认（保存等链路）：scripts 不是 JDBC 库，过滤掉。
        assert.equal(resolveConsoleInstanceLabel(shared), undefined)
        // 定位链路：保留连接级 scripts 目录。
        assert.equal(resolveConsoleInstanceLabel({...shared, keepConnectionScope: true}), '_scripts')
    })

    it('locates dev.sql node instead of falling back to connection node', () => {
        const nodeId = resolveActiveTabLocateNodeId(tab, makeOptions())
        assert.equal(nodeId, devSqlNodeId)
    })
})
