import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildRedisDelCommand,
    buildRedisGetCommand,
    findRedisCommandHint,
    matchRedisCommandHints,
    quoteRedisArg,
} from '@/features/explorer/services/redis-command-hints.service'
import {formatRedisDbLabel, parseRedisDbIndex, parseRedisDbInput, redisDbOptions, redisDbQuickPicks} from '@/features/explorer/services/redis-db.service'
import {normalizeRedisScanPattern} from '@/features/explorer/services/redis-keys-scan.service'
import {
    derivePrefixPatterns,
    filterRedisKeys,
    groupRedisKeysByPrefix,
} from '@/features/explorer/services/redis-key-prefix.service'

describe('redis-db.service', () => {
    it('parses redis db index with bounds', () => {
        assert.equal(parseRedisDbIndex(''), 0)
        assert.equal(parseRedisDbIndex('3'), 3)
        assert.equal(parseRedisDbIndex(99), 15)
        assert.equal(parseRedisDbIndex('-1'), 0)
    })

    it('formats db labels', () => {
        assert.equal(formatRedisDbLabel(0), 'DB0')
        assert.equal(redisDbOptions().length, 16)
    })

    it('builds quick picks around current db', () => {
        assert.deepEqual(redisDbQuickPicks(0), [0, 1, 2, 3, 4])
        assert.deepEqual(redisDbQuickPicks(8), [6, 7, 8, 9, 10])
        assert.deepEqual(redisDbQuickPicks(15), [11, 12, 13, 14, 15])
    })

    it('parses db input strictly', () => {
        assert.equal(parseRedisDbInput('1'), 1)
        assert.equal(parseRedisDbInput('16'), null)
        assert.equal(parseRedisDbInput('abc'), null)
    })
})

describe('redis-command-hints.service', () => {
    it('matches command prefix hints', () => {
        const hints = matchRedisCommandHints('GE')
        assert.equal(hints.some((hint) => hint.command === 'GET'), true)
    })

    it('finds exact command hint', () => {
        assert.equal(findRedisCommandHint('get foo')?.command, 'GET')
    })

    it('quotes special redis args', () => {
        assert.equal(quoteRedisArg('simple_key'), 'simple_key')
        assert.equal(quoteRedisArg('has space'), '"has space"')
        assert.equal(buildRedisGetCommand('has space'), 'GET "has space"')
        assert.equal(buildRedisDelCommand('has space'), 'DEL "has space"')
    })
})

describe('redis-keys-scan.service', () => {
    it('normalizes empty pattern to wildcard', () => {
        assert.equal(normalizeRedisScanPattern(''), '*')
        assert.equal(normalizeRedisScanPattern('user:*'), 'user:*')
        assert.equal(normalizeRedisScanPattern('oneline'), 'oneline*')
    })
})

describe('redis-key-prefix.service', () => {
    it('groups keys by colon prefix', () => {
        const groups = groupRedisKeysByPrefix([
            'SDI:AUTH:JWT',
            'oneline:user:1',
            'plain',
            'SDI:OTHER',
        ])
        assert.deepEqual(groups.find((g) => g.prefix === 'SDI:')?.keys, ['SDI:AUTH:JWT', 'SDI:OTHER'])
        assert.equal(derivePrefixPatterns(['SDI:a', 'oneline:b', 'SDI:c']).includes('SDI:*'), true)
    })

    it('filters loaded keys locally', () => {
        assert.deepEqual(filterRedisKeys(['abc', 'def'], 'bc'), ['abc'])
    })
})
