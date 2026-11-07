import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {
    indexGlobalObjectSearchEntries,
    searchGlobalObjectEntries,
} from '@/features/explorer/services/global-object-search.service'

const sampleTree: TreeNode[] = [{
    id: 'conn-1',
    label: 'Local MySQL',
    type: 'connection',
    dbType: 'mysql',
    children: [{
        id: 'db-app',
        label: 'app',
        type: 'database',
        children: [{
            id: 'folder-tables',
            label: 'tables',
            type: 'folder',
            children: [{
                id: 'table-users',
                label: 'users',
                type: 'table',
                children: [{
                    id: 'col-id',
                    label: 'id',
                    type: 'column',
                    meta: 'int',
                }],
            }, {
                id: 'view-active',
                label: 'active_users',
                type: 'view',
            }],
        }, {
            id: 'proc-save',
            label: 'save_user',
            type: 'procedure',
        }],
    }],
}]

describe('global-object-search.service', () => {
    it('indexes tables views columns and procedures under connections', () => {
        const entries = indexGlobalObjectSearchEntries(sampleTree)
        assert.deepEqual(
            entries.map((entry) => [entry.kind, entry.qualifiedLabel]).sort(),
            [
                ['column', 'app.users.id'],
                ['procedure', 'app.save_user'],
                ['table', 'app.users'],
                ['view', 'app.active_users'],
            ],
        )
    })

    it('fuzzy search matches table and column names', () => {
        const entries = indexGlobalObjectSearchEntries(sampleTree)
        const tables = searchGlobalObjectEntries(entries, 'users')
        const columns = searchGlobalObjectEntries(entries, 'id')
        assert.ok(tables.some((entry) => entry.kind === 'table' && entry.name === 'users'))
        assert.ok(columns.some((entry) => entry.kind === 'column' && entry.name === 'id'))
    })

    it('returns empty when tokens do not match', () => {
        const entries = indexGlobalObjectSearchEntries(sampleTree)
        assert.deepEqual(searchGlobalObjectEntries(entries, 'missing-object'), [])
    })
})
