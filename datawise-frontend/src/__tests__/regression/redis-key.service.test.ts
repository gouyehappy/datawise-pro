import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    formatRedisSize,
    formatRedisTtl,
    parseRedisKeyFromNodeId,
} from '@/features/explorer/services/redis-key.service'

describe('redis-key.service', () => {
    it('parseRedisKeyFromNodeId extracts key from node id', () => {
        assert.equal(parseRedisKeyFromNodeId('conn-1:redis:user:1', 'conn-1'), 'user:1')
        assert.equal(parseRedisKeyFromNodeId('conn-1:redis:__empty__', 'conn-1'), null)
        assert.equal(parseRedisKeyFromNodeId('other:redis:key', 'conn-1'), null)
    })

    it('formatRedisTtl renders human readable durations', () => {
        assert.equal(formatRedisTtl(-1), 'persistent')
        assert.equal(formatRedisTtl(45), '45s')
        assert.equal(formatRedisTtl(125), '2m 5s')
    })

    it('formatRedisSize distinguishes string and collection types', () => {
        assert.equal(formatRedisSize('string', 12), '12 chars')
        assert.equal(formatRedisSize('hash', 3), '3 items')
    })
})
