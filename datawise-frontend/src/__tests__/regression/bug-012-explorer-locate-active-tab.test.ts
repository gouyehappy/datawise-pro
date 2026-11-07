import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode, WorkspaceTab} from '@/core/types'
import {
    findSqlFileNodeUnderDatabase,
    findTableNodeUnderDatabase,
    resolveActiveTabLocateNodeId,
} from '../../features/explorer/services/explorer-locate.service.ts'
import {resolveSqlFileForLocate} from '../../features/workspace/services/console-tab-title.ts'

function databaseNode(id: string, label: string, children: TreeNode[] = []): TreeNode {
    return {id, label, type: 'database', expanded: false, children}
}

function folderNode(id: string, label: string, children: TreeNode[] = []): TreeNode {
    return {id, label, type: 'folder', expanded: false, children}
}

describe('BUG-012 explorer locate active tab', () => {
    const db = databaseNode('db-1', 'mydb', [
        folderNode('tables-folder', 'tables', [
            {id: 'table-users', label: 'users', type: 'table', expanded: false, children: []},
        ]),
        folderNode('ws-folder', 'workspaces', [
            {id: 'file-1', label: 'Script-1.sql', type: 'sql_file', expanded: false, children: []},
            {id: 'file-2', label: 'Script-2.sql', type: 'sql_file', expanded: false, children: []},
        ]),
    ])

    const findDatabaseNode = () => db
    const options = {
        findNode: (nodeId: string) => {
            if (nodeId === 'file-2') {
                return {id: 'file-2', label: 'Script-2.sql', type: 'sql_file', expanded: false, children: []}
            }
            return null
        },
        findDatabaseNode: (_connectionId: string, _label: string) => findDatabaseNode(),
        findNodeLabel: (nodeId: string) => (nodeId === 'db-1' ? 'mydb' : undefined),
        findTableNodeGlobal: () => null,
    }

    it('locates console tab with bound sql file to workspaces file node', () => {
        const tab: WorkspaceTab = {
            id: 'c1',
            title: '<10.0.0.1> Script-1',
            type: 'console',
            closable: true,
            connectionId: 'conn-1',
            instanceId: 'db-1',
            database: 'mydb',
            sqlFile: 'Script-1.sql',
        }

        assert.equal(resolveActiveTabLocateNodeId(tab, options), 'file-1')
    })

    it('infers Script-N.sql from tab title when sqlFile missing', () => {
        const tab: WorkspaceTab = {
            id: 'c2',
            title: '<192.0.2.141> Script-2',
            type: 'console',
            closable: true,
            connectionId: 'conn-1',
            instanceId: 'db-1',
            database: 'mydb',
        }

        assert.equal(resolveSqlFileForLocate(tab), 'Script-2.sql')
        assert.equal(resolveActiveTabLocateNodeId(tab, options), 'file-2')
    })

    it('uses pinned explorerNodeId when no sql file can be resolved', () => {
        const tab: WorkspaceTab = {
            id: 'c3',
            title: '<192.0.2.141> Console',
            type: 'console',
            closable: true,
            connectionId: 'conn-1',
            instanceId: 'db-1',
            database: 'mydb',
            explorerNodeId: 'file-2',
        }

        assert.equal(resolveSqlFileForLocate(tab), null)
        assert.equal(resolveActiveTabLocateNodeId(tab, options), 'file-2')
    })

    it('prefers bound sql file over stale explorerNodeId', () => {
        const tab: WorkspaceTab = {
            id: 'c3b',
            title: '<192.0.2.141> 智能标签',
            type: 'console',
            closable: true,
            connectionId: 'conn-1',
            instanceId: 'db-1',
            database: 'mydb',
            sqlFile: 'Script-1.sql',
            explorerNodeId: 'file-2',
        }

        assert.equal(resolveActiveTabLocateNodeId(tab, options), 'file-1')
    })

    it('locates provisional Script-N tab to workspaces file when present', () => {
        const tab: WorkspaceTab = {
            id: 'c4',
            title: '<10.0.0.1> Script-1',
            type: 'console',
            closable: true,
            connectionId: 'conn-1',
            instanceId: 'db-1',
            database: 'mydb',
        }

        assert.equal(resolveSqlFileForLocate(tab), 'Script-1.sql')
        assert.equal(resolveActiveTabLocateNodeId(tab, options), 'file-1')
    })

    it('locates project sandbox local-text tab to project-file node id', () => {
        const uri = 'dw-project://proj_default/docs/connectors.md'
        const tab: WorkspaceTab = {
            id: 'lt-1',
            title: 'connectors.md',
            type: 'local-text',
            closable: true,
            localFilePath: uri,
            explorerNodeId: 'project-file:proj_default:docs:connectors.md',
        }
        assert.equal(
            resolveActiveTabLocateNodeId(tab, options),
            'project-file:proj_default:docs:connectors.md',
        )
    })

    it('locates table tab to table node instead of database', () => {
        const tab: WorkspaceTab = {
            id: 't1',
            title: 'users',
            type: 'table',
            closable: true,
            connectionId: 'conn-1',
            instanceId: 'db-1',
            database: 'mydb',
            tableName: 'users',
            explorerNodeId: 'table-users',
        }

        assert.equal(resolveActiveTabLocateNodeId(tab, options), 'table-users')
    })

    it('finds table and sql file under database folders', () => {
        assert.equal(findTableNodeUnderDatabase(db, 'users')?.id, 'table-users')
        assert.equal(findSqlFileNodeUnderDatabase(db, 'Script-2.sql')?.id, 'file-2')
    })
})
