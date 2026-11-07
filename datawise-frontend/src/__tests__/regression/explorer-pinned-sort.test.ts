import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {
    isConfiguredDefaultDatabaseNode,
    isPinnableExplorerNode,
    matchesConfiguredDatabaseLabel,
    promoteConfiguredDatabaseAfterPinned,
    shouldSortChildrenByPinned,
    sortExplorerChildrenByPinned,
    sortGroupChildrenByPinned,
} from '@/features/explorer/services/explorer-pinned-sort.service'

function node(partial: Partial<TreeNode> & Pick<TreeNode, 'id' | 'label' | 'type'>): TreeNode {
    return {...partial}
}

describe('explorer-pinned-sort.service', () => {
    it('allows pinning connection, database, schema, and table nodes', () => {
        assert.equal(isPinnableExplorerNode({type: 'connection'}), true)
        assert.equal(isPinnableExplorerNode({type: 'database'}), true)
        assert.equal(isPinnableExplorerNode({type: 'schema'}), true)
        assert.equal(isPinnableExplorerNode({type: 'table'}), true)
        assert.equal(isPinnableExplorerNode({type: 'group'}), false)
    })

    it('sorts pinned connections after subgroups within a group', () => {
        const children = [
            node({id: 'sub-1', label: 'sub', type: 'group'}),
            node({id: 'conn-z', label: 'zoo', type: 'connection', dbType: 'mysql'}),
            node({id: 'conn-a', label: 'alpha', type: 'connection', dbType: 'mysql'}),
            node({id: 'conn-b', label: 'beta', type: 'connection', dbType: 'mysql'}),
        ]
        const sorted = sortGroupChildrenByPinned(children, ['conn-b'])
        assert.deepEqual(sorted.map((item) => item.id), ['sub-1', 'conn-b', 'conn-a', 'conn-z'])
    })

    it('sorts pinned children before others under connection', () => {
        const children = [
            node({id: 'db-z', label: 'zoo', type: 'database'}),
            node({id: 'db-a', label: 'alpha', type: 'database'}),
            node({id: 'db-b', label: 'beta', type: 'database'}),
        ]
        const sorted = sortExplorerChildrenByPinned(children, ['db-b', 'db-z'])
        assert.deepEqual(sorted.map((item) => item.id), ['db-b', 'db-z', 'db-a'])
    })

    it('sorts pinned tables within tables folder', () => {
        const parent = node({id: 'folder-tables', label: 'tables', type: 'folder'})
        assert.equal(shouldSortChildrenByPinned(parent), true)

        const children = [
            node({id: 'tbl-users', label: 'users', type: 'table'}),
            node({id: 'tbl-orders', label: 'orders', type: 'table'}),
            node({id: 'tbl-items', label: 'items', type: 'table'}),
        ]
        const sorted = sortExplorerChildrenByPinned(children, ['tbl-orders'])
        assert.deepEqual(sorted.map((item) => item.id), ['tbl-orders', 'tbl-items', 'tbl-users'])
    })

    it('keeps original order when nothing is pinned', () => {
        const children = [
            node({id: 'db-b', label: 'beta', type: 'database'}),
            node({id: 'db-a', label: 'alpha', type: 'database'}),
        ]
        const sorted = sortExplorerChildrenByPinned(children, [])
        assert.deepEqual(sorted.map((item) => item.id), ['db-b', 'db-a'])
    })

    it('matches connection-form default database labels', () => {
        assert.equal(matchesConfiguredDatabaseLabel('admin_db', 'admin_db'), true)
        assert.equal(matchesConfiguredDatabaseLabel('Admin_DB', 'admin_db'), true)
        assert.equal(matchesConfiguredDatabaseLabel('hive', 'hive.default'), true)
        assert.equal(matchesConfiguredDatabaseLabel('other', 'admin_db'), false)
        assert.equal(isConfiguredDefaultDatabaseNode({type: 'database', label: 'admin_db'}, 'admin_db'), true)
        assert.equal(isConfiguredDefaultDatabaseNode({type: 'folder', label: 'admin_db'}, 'admin_db'), false)
    })

    it('promotes configured default database after pinned children', () => {
        const children = [
            node({id: 'db-z', label: 'zoo', type: 'database'}),
            node({id: 'db-a', label: 'alpha', type: 'database'}),
            node({id: 'db-admin', label: 'admin_db', type: 'database'}),
        ]
        assert.deepEqual(
            promoteConfiguredDatabaseAfterPinned(children, 'admin_db').map((item) => item.id),
            ['db-admin', 'db-z', 'db-a'],
        )

        const pinnedFirst = sortExplorerChildrenByPinned(children, ['db-z'])
        assert.deepEqual(pinnedFirst.map((item) => item.id), ['db-z', 'db-admin', 'db-a'])
        assert.deepEqual(
            promoteConfiguredDatabaseAfterPinned(pinnedFirst, 'alpha', ['db-z']).map((item) => item.id),
            ['db-z', 'db-a', 'db-admin'],
        )
    })
})
