import assert from 'node:assert/strict'
import test from 'node:test'
import {formatRedisConsoleEntry} from '@/features/explorer/services/redis-console.service'

test('formatRedisConsoleEntry renders success output', () => {
    const text = formatRedisConsoleEntry({
        command: 'PING',
        output: 'PONG',
        success: true,
        durationMs: 3,
    })
    assert.match(text, /> PING/)
    assert.match(text, /PONG/)
})

test('formatRedisConsoleEntry renders error output', () => {
    const text = formatRedisConsoleEntry({
        command: 'GET missing',
        output: 'ERR no such key',
        success: false,
        durationMs: 1,
    })
    assert.match(text, /\(error\)/)
    assert.match(text, /ERR no such key/)
})
