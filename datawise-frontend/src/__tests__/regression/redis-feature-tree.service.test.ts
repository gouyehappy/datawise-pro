import assert from 'node:assert/strict'
import {describe, it, beforeEach} from 'node:test'
import {
    __setExplorerUiCatalogForTests,
    ensureCatalogFeatureChildren,
} from '@/features/explorer/services/explorer-ui-catalog.service'
import {parseRedisFeatureId} from '@/features/explorer/services/redis-feature-tree.service'

describe('redis-feature-tree.service', () => {
    beforeEach(() => {
        __setExplorerUiCatalogForTests(null)
    })

    it('injects single workbench child for redis connection', () => {
        const connection = {id: 'redis-1', label: 'local', type: 'connection' as const, dbType: 'redis' as const}
        ensureCatalogFeatureChildren(connection)
        assert.equal(connection.children?.length, 1)
        assert.equal(connection.children?.[0].meta, 'workbench')
        const previous = connection.children
        ensureCatalogFeatureChildren(connection)
        assert.equal(connection.children, previous)
    })

    it('parses feature id from node meta', () => {
        assert.equal(parseRedisFeatureId({type: 'redis-feature', meta: 'workbench'}), 'workbench')
        assert.equal(parseRedisFeatureId({type: 'redis-feature', meta: 'keys'}), 'keys')
        assert.equal(parseRedisFeatureId({type: 'redis-feature', meta: 'command'}), 'command')
        assert.equal(parseRedisFeatureId({type: 'connection', meta: 'keys'}), null)
    })
})
