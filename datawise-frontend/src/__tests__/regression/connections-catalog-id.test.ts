import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {normalizeConnectionsCatalog} from '@/shared/config/connections-catalog-normalize'
import {buildExplorerTreeFromCatalog} from '@/shared/config/connections-explorer-tree'

describe('connections catalog ids', () => {
    it('normalizeConnectionsCatalog dedupes duplicate group ids (last wins)', () => {
        const normalized = normalizeConnectionsCatalog({
            version: 1,
            groups: [
                {id: 'group-x', label: 'dev', parentId: null, sortOrder: 0, expanded: true},
                {id: 'group-x', label: 'nosql', parentId: null, sortOrder: 1, expanded: true},
            ],
            connections: [],
        })

        assert.equal(normalized.groups.length, 1)
        assert.equal(normalized.groups[0]?.label, 'nosql')
    })

    it('buildExplorerTreeFromCatalog renders one root per unique group id', () => {
        const tree = buildExplorerTreeFromCatalog({
            version: 1,
            groups: [
                {id: 'group-x', label: 'dev', parentId: null, sortOrder: 0, expanded: true},
                {id: 'group-x', label: 'nosql', parentId: null, sortOrder: 1, expanded: true},
            ],
            connections: [],
        })

        assert.equal(tree.length, 1)
        assert.equal(tree[0]?.id, 'group-x')
        assert.equal(tree[0]?.label, 'nosql')
    })

    it('buildExplorerTreeFromCatalog copies connection env onto tree nodes', () => {
        const tree = buildExplorerTreeFromCatalog({
            version: 1,
            groups: [
                {id: 'group-1', label: '默认组', parentId: null, sortOrder: 0, expanded: true},
            ],
            connections: [
                {
                    id: 'conn-1',
                    groupId: 'group-1',
                    sortOrder: 0,
                    config: {
                        id: 'conn-1',
                        name: 'shop',
                        dbType: 'mysql',
                        env: 'prod',
                        storage: 'server',
                        host: '127.0.0.1',
                        port: '3306',
                        auth: 'USER',
                        user: 'root',
                        password: '',
                        database: 'admin_db',
                    },
                },
            ],
        })

        const connection = tree[0]?.children?.[0]
        assert.equal(connection?.type, 'connection')
        assert.equal(connection?.env, 'prod')
        assert.equal(connection?.database, 'admin_db')
    })

    it('legacy truncated group ids could collide within ~100s', () => {
        function legacyGroupId(timestampMs: number): string {
            const token = `group-${timestampMs}-abc12`
            return `group-${token.slice(6, 14)}`
        }

        assert.equal(legacyGroupId(1_782_368_312_345), legacyGroupId(1_782_368_399_999))
        assert.notEqual(legacyGroupId(1_782_368_312_345), legacyGroupId(1_782_368_412_345))
    })
})
