import assert from 'node:assert/strict'
import {describe, test} from 'node:test'
import type {TreeNode} from '@/core/types'
import {
    resolveFolderItemCount,
    resolveFolderItemCountLabel,
    resolveFolderItemCountParts,
    syncFolderChildCount,
} from '@/features/explorer/services/explorer-folder-count.service'

describe('explorer-folder-count', () => {
    test('hides backend count until catalog folder is loaded', () => {
        const views: TreeNode = {id: 'v1', label: 'views', type: 'folder', childCount: 0, children: []}
        assert.equal(resolveFolderItemCount(views), null)
        assert.equal(resolveFolderItemCountLabel(views), null)

        const tablesHint: TreeNode = {
            id: 't0',
            label: 'tables',
            type: 'folder',
            childCount: 6,
            children: [],
        }
        assert.equal(resolveFolderItemCount(tablesHint), null)
    })

    test('shows zero after empty folder load', () => {
        const views: TreeNode = {
            id: 'v1',
            label: 'views',
            type: 'folder',
            childCount: 0,
            children: [],
            meta: 'views:loaded',
        }
        assert.equal(resolveFolderItemCount(views), 0)
        assert.equal(resolveFolderItemCountLabel(views), '0')
    })

    test('shows table count from preloaded children', () => {
        const tables: TreeNode = {
            id: 't1',
            label: 'tables',
            type: 'folder',
            childCount: 2,
            children: [
                {id: 'tb1', label: 'users', type: 'table'},
                {id: 'tb2', label: 'orders', type: 'table'},
            ],
        }
        assert.deepEqual(resolveFolderItemCountParts(tables), {loaded: 2, total: 2})
        assert.equal(resolveFolderItemCountLabel(tables), '2 of 2')
    })

    test('sync updates count after lazy load', () => {
        const views: TreeNode = {
            id: 'v1',
            label: 'views',
            type: 'folder',
            childCount: 0,
            children: [],
            meta: 'views:loaded',
        }
        views.children = [{id: 'vw1', label: 'active_users', type: 'view'}]
        syncFolderChildCount(views)
        assert.equal(views.childCount, 1)
        assert.equal(resolveFolderItemCountLabel(views), '1')
    })

    test('preserves total count when tables folder is paginated', () => {
        const tables: TreeNode = {
            id: 't1',
            label: 'tables',
            type: 'folder',
            childCount: 120,
            children: [
                {id: 'tb1', label: 'users', type: 'table'},
                {id: 'lm', label: 'Load more', type: 'load_more', meta: '50'},
            ],
        }
        syncFolderChildCount(tables)
        assert.equal(tables.childCount, 120)
        assert.deepEqual(resolveFolderItemCountParts(tables), {loaded: 1, total: 120})
        assert.equal(resolveFolderItemCountLabel(tables), '1 of 120')
    })

    test('shows loaded+ when paginated total is still unknown', () => {
        const tables: TreeNode = {
            id: 't1',
            label: 'tables',
            type: 'folder',
            childCount: 50,
            children: [
                {id: 'tb1', label: 'users', type: 'table'},
                {id: 'lm', label: 'Load more', type: 'load_more', meta: '50'},
            ],
        }
        // Only one countable child in this fixture; loaded=1, stored total=50 → still of-format.
        assert.equal(resolveFolderItemCountLabel(tables), '1 of 50')

        tables.childCount = 1
        assert.equal(resolveFolderItemCountLabel(tables), '1+')
    })

    test('counts workspace sql_file children', () => {
        const workspaces: TreeNode = {
            id: 'ws1',
            label: 'workspaces',
            type: 'folder',
            childCount: 0,
            children: [
                {id: 's1', label: 'demo01.sql', type: 'sql_file'},
                {id: 's2', label: 'Script-2.sql', type: 'sql_file'},
            ],
            meta: 'workspaces:loaded',
        }
        syncFolderChildCount(workspaces)
        assert.equal(workspaces.childCount, 2)
        assert.equal(resolveFolderItemCountLabel(workspaces), '2')
    })

    test('hides connection database count until connected', () => {
        const conn: TreeNode = {
            id: 'c1',
            label: 'MySQL@host',
            type: 'connection',
            dbType: 'mysql',
            children: [],
        }
        assert.equal(resolveFolderItemCount(conn), null)
        assert.equal(resolveFolderItemCountLabel(conn), null)
    })

    test('shows connection database count as loaded of total', () => {
        const conn: TreeNode = {
            id: 'c1',
            label: 'MySQL@host',
            type: 'connection',
            dbType: 'mysql',
            children: [
                {id: 'db1', label: 'aaflinktest', type: 'database'},
                {id: 'db2', label: 'admin_db', type: 'database'},
            ],
        }
        syncFolderChildCount(conn)
        assert.equal(conn.childCount, 2)
        assert.deepEqual(resolveFolderItemCountParts(conn), {loaded: 2, total: 2})
        assert.equal(resolveFolderItemCountLabel(conn), '2 of 2')
    })

    test('does not show count on flat platform connections', () => {
        const redis: TreeNode = {
            id: 'r1',
            label: 'Redis',
            type: 'connection',
            dbType: 'redis',
            children: [{id: 'keys', label: 'Keys', type: 'redis-feature'}],
        }
        assert.equal(resolveFolderItemCount(redis), null)
        assert.equal(resolveFolderItemCountLabel(redis), null)
    })
})
