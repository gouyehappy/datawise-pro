import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {TreeNode} from '@/core/types'
import {resolveTablesRefreshScope} from '@/features/explorer/services/explorer-refresh-scope.service'
import {
    isCopyNameMenuAction,
    isEditConnectionMenuAction,
    isMoveHereMenuAction,
    resolveCatalogDeletedMessageKey,
    resolveDeleteMenuIntent,
    resolveKafkaPublishMenuIntent,
    resolveRefreshMenuTarget,
    resolveShortcutEditIntent,
    resolveShortcutOpenIntent,
    resolveSimpleScopedMenuAction,
} from '@/features/explorer/services/explorer-menu-intents.service'

function node(partial: Partial<TreeNode> & Pick<TreeNode, 'id' | 'label' | 'type'>): TreeNode {
    return {...partial}
}

describe('explorer-refresh-scope.service', () => {
    it('resolves scope for table and tables folder', () => {
        const table = node({id: 't1', label: 'users', type: 'table'})
        const tablesFolder = node({
            id: 'folder-tables',
            label: 'tables',
            type: 'folder',
            children: [table],
        })
        const database = node({
            id: 'db1',
            label: 'app',
            type: 'database',
            children: [tablesFolder],
        })
        const connection = node({
            id: 'c1',
            label: 'conn',
            type: 'connection',
            dbType: 'mysql',
            children: [database],
        })
        const tree = [connection]

        assert.deepEqual(resolveTablesRefreshScope(tree, table), {
            connectionId: 'c1',
            scopeLabel: 'app',
            scopeNodeId: 'db1',
        })
        assert.deepEqual(resolveTablesRefreshScope(tree, tablesFolder), {
            connectionId: 'c1',
            scopeLabel: 'app',
            scopeNodeId: 'db1',
        })
        assert.equal(resolveTablesRefreshScope(tree, connection), null)
    })
})

describe('explorer-menu-intents remaining actions', () => {
    it('resolves refresh / delete / edit / copy / move intents', () => {
        assert.equal(resolveRefreshMenuTarget('refresh', {type: 'connection', label: 'c'}), 'connection')
        assert.equal(resolveRefreshMenuTarget('refresh', {type: 'folder', label: 'tables'}), 'tables-scope')
        assert.equal(resolveRefreshMenuTarget('refresh', {type: 'group', label: 'g'}), null)
        assert.equal(resolveDeleteMenuIntent('delete-database', 'database'), 'delete-database')
        assert.equal(resolveDeleteMenuIntent('delete', 'table'), 'delete-table')
        assert.equal(resolveDeleteMenuIntent('delete', 'group'), 'delete-catalog')
        assert.equal(isEditConnectionMenuAction('edit', {type: 'connection', dbType: 'mysql'}), true)
        assert.equal(isEditConnectionMenuAction('edit', {type: 'connection'}), false)
        assert.equal(isCopyNameMenuAction('copy-name'), true)
        assert.equal(isMoveHereMenuAction('move-here', 'group'), true)
        assert.equal(resolveCatalogDeletedMessageKey('group'), 'explorer.groupDeleted')
        assert.equal(resolveCatalogDeletedMessageKey('connection'), 'explorer.connectionDeleted')
    })

    it('resolves shortcut / kafka / scoped menu intents', () => {
        assert.equal(resolveShortcutOpenIntent({type: 'connection', dbType: 'mysql'}), 'connection-form')
        assert.equal(resolveShortcutOpenIntent({type: 'table'}), 'open-node')
        assert.equal(resolveShortcutEditIntent({type: 'table'}), 'table-properties')
        assert.equal(resolveShortcutEditIntent({type: 'connection', dbType: 'mysql'}), 'connection-form')
        assert.equal(
            resolveKafkaPublishMenuIntent('publish-table-data', {type: 'connection', dbType: 'kafka'}),
            'from-kafka-connection',
        )
        assert.equal(
            resolveKafkaPublishMenuIntent('publish-to-kafka', {type: 'table'}),
            'from-table',
        )
        assert.equal(resolveSimpleScopedMenuAction('import', 'table'), 'import')
        assert.equal(resolveSimpleScopedMenuAction('export-metadoc', 'database'), 'export-metadoc')
        assert.equal(resolveSimpleScopedMenuAction('truncate', 'database'), null)
    })
})
