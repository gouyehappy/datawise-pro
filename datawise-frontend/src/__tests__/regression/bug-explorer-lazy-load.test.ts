import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {mergeLoadedChildren, needsLazyLoad, filterConnectionSchemaChildren} from '@/features/explorer/services/explorer-lazy-load'

function node(partial: Partial<TreeNode> & Pick<TreeNode, 'id' | 'label' | 'type'>): TreeNode {
    return {...partial}
}

describe('explorer lazy load', () => {
    it('loads database folders before tables', () => {
        const database = node({id: 'db-1', label: 'admin_db', type: 'database'})
        assert.equal(needsLazyLoad(database), true)

        mergeLoadedChildren(database, [
            node({id: 'tables', label: 'tables', type: 'folder', children: []}),
        ])
        assert.equal(needsLazyLoad(database), false)
    })

    it('reloads trino catalog when only legacy tables folder is cached', () => {
        const database = node({
            id: 'db-hive',
            label: 'hive',
            type: 'database',
            children: [node({id: 'tables', label: 'tables', type: 'folder', children: []})],
        })
        assert.equal(needsLazyLoad(database, 'trino'), true)
    })

    it('treats hive flat database folders as loaded so expand toggle can collapse', () => {
        const database = node({
            id: 'db-a003',
            label: 'a003',
            type: 'database',
            expanded: true,
            children: [
                node({id: 'folder-tables', label: 'tables', type: 'folder', children: []}),
                node({id: 'folder-models', label: 'models', type: 'folder', children: []}),
                node({id: 'folder-views', label: 'views', type: 'folder', children: []}),
            ],
        })
        assert.equal(needsLazyLoad(database, 'hive'), false)
    })

    it('loads schema folders when expanded flag is set but children are missing', () => {
        const schema = node({
            id: 'schema-a003',
            label: 'a003',
            type: 'schema',
            expanded: true,
            children: [],
        })
        assert.equal(needsLazyLoad(schema, 'trino'), true)
    })

    it('loads table skeleton before columns/keys/indexes', () => {
        const table = node({id: 'table-1', label: 'cdp_segment', type: 'table'})
        assert.equal(needsLazyLoad(table), true)

        mergeLoadedChildren(table, [
            node({id: 'cols', label: 'columns', type: 'columns', children: []}),
            node({id: 'keys', label: 'keys', type: 'keys', children: []}),
            node({id: 'idx', label: 'indexes', type: 'indexes', children: []}),
        ])
        assert.equal(needsLazyLoad(table), false)
    })

    it('loads keys and indexes on demand', () => {
        const keys = node({id: 'keys', label: 'keys', type: 'keys', children: []})
        const indexes = node({id: 'idx', label: 'indexes', type: 'indexes', children: []})

        assert.equal(needsLazyLoad(keys), true)
        assert.equal(needsLazyLoad(indexes), true)

        mergeLoadedChildren(keys, [
            node({id: 'pk', label: 'PRIMARY', type: 'primary_key', meta: 'id'}),
        ])
        mergeLoadedChildren(indexes, [
            node({id: 'ix', label: 'idx_name', type: 'index', meta: 'unique · name'}),
        ])

        assert.equal(needsLazyLoad(keys), false)
        assert.equal(needsLazyLoad(indexes), false)
    })

    it('skips replacing children when lazy-load payload is unchanged', () => {
        const folder = node({
            id: 'ws',
            label: 'workspaces',
            type: 'folder',
            children: [node({id: 'f1', label: 'Script-1.sql', type: 'sql_file'})],
        })
        const previous = folder.children

        mergeLoadedChildren(folder, [
            node({id: 'f1', label: 'Script-1.sql', type: 'sql_file'}),
        ])

        assert.equal(folder.children, previous)
    })

    it('does not keep kafka topics in explorer tree', () => {
        const connection = node({
            id: 'kafka-1',
            label: 'kafka',
            type: 'connection',
            dbType: 'kafka',
        })
        assert.equal(needsLazyLoad(connection), false)

        mergeLoadedChildren(connection, [
            node({id: 'kafka-1:kafka:orders', label: 'orders', type: 'kafka-topic'}),
        ])
        assert.deepEqual(connection.children, [])
        assert.equal(filterConnectionSchemaChildren('kafka', [
            node({id: 'kafka-1:kafka:orders', label: 'orders', type: 'kafka-topic'}),
        ]).length, 0)
    })

    it('treats kubernetes as flat catalog (explorer-ui features only)', () => {
        assert.equal(filterConnectionSchemaChildren('kubernetes', [
            node({id: 'k1:ns', label: 'default', type: 'database'}),
        ]).length, 0)
        assert.equal(filterConnectionSchemaChildren('mongodb', [
            node({id: 'm1:db', label: 'app', type: 'database'}),
        ]).length, 1)
        assert.equal(filterConnectionSchemaChildren('trino', [
            node({id: 't1:cat', label: 'hive', type: 'database'}),
        ]).length, 1)
    })
})
