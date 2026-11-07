import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildRedisPlaceholderForKey,
    buildRedisQuickCommandsForKey,
    resolveRedisKeyIdleHintKey,
} from '@/features/explorer/services/redis-command-hints.service'

describe('redis-command-hints.service key type', () => {
    it('builds hash quick commands', () => {
        const commands = buildRedisQuickCommandsForKey('user:1', 'hash')
        assert.equal(commands[0], 'HGETALL user:1')
        assert.ok(commands.includes('HLEN user:1'))
    })

    it('builds list quick commands', () => {
        const commands = buildRedisQuickCommandsForKey('queue', 'list')
        assert.equal(commands[0], 'LRANGE queue 0 10')
        assert.ok(commands.includes('LLEN queue'))
    })

    it('builds stream placeholder', () => {
        assert.equal(
            buildRedisPlaceholderForKey('events', 'stream'),
            'XRANGE events - + COUNT 10',
        )
    })

    it('falls back when type is unknown', () => {
        assert.equal(buildRedisPlaceholderForKey('mykey', null), 'TYPE mykey')
        assert.equal(resolveRedisKeyIdleHintKey(undefined), 'keyHintUnknown')
    })
})
