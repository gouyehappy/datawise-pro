import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildInnerJoinLine,
    buildInnerJoinLineInsert,
    buildLeftJoinLineInsert,
    fkJoinLineCandidates,
    matchesFkJoinLinePrefix,
} from '../utils/fk-join-lines.ts'
import type {SqlEditorSchema} from '../types.ts'
import {adjustKeywordInsertNewlines} from '../utils/format-as-you-type.ts'

const schema: SqlEditorSchema = {
    tables: ['orders', 'users'],
    columns: {
        orders: [{name: 'id'}, {name: 'user_id'}],
        users: [{name: 'id'}, {name: 'name'}],
    },
    foreignKeys: [
        {fromTable: 'orders', fromColumn: 'user_id', toTable: 'users', toColumn: 'id'},
    ],
}

describe('fk-join-lines', () => {
    it('builds candidates with ON condition from FK', () => {
        const candidates = fkJoinLineCandidates(
            schema,
            ['orders'],
            {o: 'orders'},
            'SELECT * FROM orders o',
            'SELECT * FROM orders o ',
        )
        assert.ok(candidates.length >= 1)
        const first = candidates[0]!
        assert.equal(first.targetTable, 'users')
        assert.match(first.condition, /user_id/i)
        assert.match(buildInnerJoinLine(first), /^INNER JOIN users \w+ ON /)
        assert.equal(buildInnerJoinLineInsert(first).startsWith('\n'), true)
        assert.equal(buildLeftJoinLineInsert(first).startsWith('\nLEFT JOIN'), true)
    })

    it('matches table prefix and join abbreviations', () => {
        const candidate = {
            targetTable: 'users',
            sourceTable: 'orders',
            condition: 'o.user_id = u.id',
            sourceAlias: 'o',
            targetAlias: 'u',
        }
        assert.equal(matchesFkJoinLinePrefix(candidate, '', 'left'), true)
        assert.equal(matchesFkJoinLinePrefix(candidate, 'us', 'left'), true)
        assert.equal(matchesFkJoinLinePrefix(candidate, 'lj', 'left'), true)
        assert.equal(matchesFkJoinLinePrefix(candidate, 'ij', 'inner'), true)
        assert.equal(matchesFkJoinLinePrefix(candidate, 'lj', 'inner'), false)
        assert.equal(matchesFkJoinLinePrefix(candidate, 'xyz', 'left'), false)
    })

    it('strips leading newline at line start', () => {
        const candidate = {
            targetTable: 'users',
            sourceTable: 'orders',
            condition: 'o.user_id = u.id',
            sourceAlias: 'o',
            targetAlias: 'u',
        }
        const raw = buildLeftJoinLineInsert(candidate)
        assert.equal(
            adjustKeywordInsertNewlines(raw, 'SELECT * FROM orders o '),
            raw,
        )
        assert.equal(
            adjustKeywordInsertNewlines(raw, '   '),
            raw.replace(/^\n+/, ''),
        )
    })
})
