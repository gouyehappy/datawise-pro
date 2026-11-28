import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    findConnectionScriptsFolder,
    isConnectionScriptsInstance,
    parseTrinoCatalogSchemaFromSql,
    resolveConsoleWorkspaceInstance,
    resolveWorkspaceInstanceNodeId,
    TRINO_CONNECTION_SCRIPTS_INSTANCE,
} from '../../features/workspace/services/console-workspace-instance.ts'
import type {TreeNode} from '../../core/types.ts'

describe('console-workspace-instance', () => {
    it('parses catalog.schema from three-part qualified name', () => {
        assert.equal(
            parseTrinoCatalogSchemaFromSql('SELECT * FROM kudu.a003.hh_15'),
            'kudu.a003',
        )
    })

    it('always saves trino consoles under connection scripts', () => {
        assert.equal(
            resolveConsoleWorkspaceInstance({
                dbType: 'trino',
                sql: 'SELECT * FROM kudu.a003.hh_15',
                tabDatabase: 'hive.a003',
                tree: [],
                connectionId: 'conn-1',
            }),
            TRINO_CONNECTION_SCRIPTS_INSTANCE,
        )
        assert.equal(
            resolveConsoleWorkspaceInstance({
                dbType: 'trino',
                sql: 'SELECT * FROM kudu.a003.hh_15',
                tabDatabase: 'kudu',
                tree: [],
                connectionId: 'conn-1',
            }),
            TRINO_CONNECTION_SCRIPTS_INSTANCE,
        )
        assert.equal(
            resolveConsoleWorkspaceInstance({
                dbType: 'presto',
                sql: 'SELECT 1',
                tabDatabase: undefined,
                tree: [],
                connectionId: 'conn-1',
            }),
            TRINO_CONNECTION_SCRIPTS_INSTANCE,
        )
    })

    it('keeps mysql database label unchanged', () => {
        assert.equal(
            resolveConsoleWorkspaceInstance({
                dbType: 'mysql',
                sql: 'SELECT 1',
                tabDatabase: 'admin_db',
                tree: [],
                connectionId: 'conn-1',
            }),
            'admin_db',
        )
    })

    it('resolves connection scripts folder node for _scripts instance', () => {
        const tree: TreeNode[] = [
            {
                id: 'conn-1',
                label: 'trino',
                type: 'connection',
                dbType: 'trino',
                children: [
                    {id: 'folder-scripts-conn-1', label: 'scripts', type: 'folder', children: []},
                    {id: 'db-hive', label: 'hive', type: 'database', children: []},
                ],
            },
        ]
        assert.equal(isConnectionScriptsInstance('_scripts'), true)
        assert.equal(isConnectionScriptsInstance('scripts'), true)
        assert.equal(findConnectionScriptsFolder(tree[0]!)?.id, 'folder-scripts-conn-1')
        assert.equal(
            resolveWorkspaceInstanceNodeId(tree, 'conn-1', '_scripts', 'trino'),
            'folder-scripts-conn-1',
        )
        assert.equal(
            resolveWorkspaceInstanceNodeId(tree, 'conn-1', 'scripts', 'presto'),
            'folder-scripts-conn-1',
        )
    })
})
