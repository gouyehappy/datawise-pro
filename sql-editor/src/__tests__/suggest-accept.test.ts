import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {isCompletionAcceptChange} from '../completion/monaco/suggest-accept-utils.ts'
import {sortClauseNextKeywords} from '../completion/completion-phase.ts'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {shouldAbortCompletion} from '../completion/policy/guards.ts'

describe('suggest-accept', () => {
    it('detects multi-char and replace inserts as completion accept', () => {
        assert.equal(isCompletionAcceptChange({rangeLength: 3, text: 'users', rangeOffset: 0}), true)
        assert.equal(isCompletionAcceptChange({rangeLength: 0, text: 's', rangeOffset: 0}), false)
        assert.equal(isCompletionAcceptChange({rangeLength: 1, text: '*', rangeOffset: 0}), true)
    })
})

describe('sortClauseNextKeywords', () => {
    it('puts WHERE before LEFT and JOIN qualifiers', () => {
        const sorted = sortClauseNextKeywords(['LEFT', 'WHERE', 'INNER', 'JOIN', 'RIGHT'])
        assert.equal(sorted[0], 'WHERE')
        assert.ok(sorted.indexOf('WHERE') < sorted.indexOf('LEFT'))
    })
})

describe('guards table complete', () => {
    const TABLES = ['orders', 'users']
    const COLUMNS = {orders: [{name: 'id'}], users: [{name: 'id'}]}
    const TriggerCharacter = 1
    const Invoke = 0

    it('aborts auto suggest right after table name without trailing space', () => {
        const sql = 'SELECT * FROM users'
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
        assert.equal(
            shouldAbortCompletion({sql, offset, prefix: '', ctx, triggerKind: 2}),
            true,
        )
    })

    it('allows space-triggered suggest after table alias', () => {
        const sql = 'SELECT * FROM users us '
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
        assert.equal(
            shouldAbortCompletion({sql, offset, prefix: '', ctx, triggerKind: TriggerCharacter}),
            false,
        )
    })

    it('allows manual invoke after table name', () => {
        const sql = 'SELECT * FROM users'
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
        assert.equal(
            shouldAbortCompletion({sql, offset, prefix: '', ctx, triggerKind: Invoke}),
            false,
        )
    })
})
