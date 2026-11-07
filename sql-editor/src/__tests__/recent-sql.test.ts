import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    filterRecentSqlForSuggest,
    recentSqlMatchesPrefix,
    rankRecentSqlForSuggest,
} from '../utils/recent-sql.ts'
import type {SqlRecentQuery} from '../types.ts'

const items: SqlRecentQuery[] = [
    {
        id: '1',
        sql: 'SELECT * FROM orders o WHERE o.status = 1',
        connectionId: 'c1',
        database: 'db1',
        tables: ['orders'],
    },
    {
        id: '2',
        sql: 'SELECT * FROM users',
        connectionId: 'c2',
        database: 'db2',
        tables: ['users'],
    },
    {
        id: '3',
        sql: 'SELECT id FROM product',
        connectionId: 'c1',
        database: 'db1',
        tables: ['product'],
    },
]

describe('recent-sql', () => {
    it('matches prefix against sql and table names', () => {
        assert.equal(recentSqlMatchesPrefix(items[0]!, ''), true)
        assert.equal(recentSqlMatchesPrefix(items[0]!, 'ord'), true)
        assert.equal(recentSqlMatchesPrefix(items[0]!, 'status'), true)
        assert.equal(recentSqlMatchesPrefix(items[0]!, 'xyz'), false)
    })

    it('ranks same connection/database first', () => {
        const ranked = rankRecentSqlForSuggest(items, {connectionId: 'c1', database: 'db1'})
        assert.equal(ranked[0]?.id, '1')
        assert.equal(ranked[1]?.id, '3')
    })

    it('filters and dedupes for suggest', () => {
        const filtered = filterRecentSqlForSuggest(
            [...items, {...items[0]!, id: 'dup'}],
            'ord',
            {connectionId: 'c1', database: 'db1'},
        )
        assert.equal(filtered.length, 1)
        assert.equal(filtered[0]?.id, '1')
    })
})
