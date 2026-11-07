import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {allowsEmptyPrefixCompletion} from '../completion/policy/guards.ts'
import type {SqlCompletionContext} from '../completion/context.ts'

function fromCtx(tablePrefix: string): SqlCompletionContext {
    return {
        statement: 'select',
        slot: 'from',
        qualifier: null,
        aliases: {},
        resolvedTable: null,
        columnPrefix: null,
        signals: {} as SqlCompletionContext['signals'],
        fromJoin: {
            tablePrefix,
            resolvedTable: null,
            tableClauseComplete: false,
            aliasOnLineAfterCursor: null,
        },
        predicateSlot: null,
        segment: `select * from ${tablePrefix}`,
    }
}

describe('completion guards — qualified trailing dot', () => {
    it('allows empty prefix at hive.', () => {
        assert.equal(allowsEmptyPrefixCompletion(fromCtx('hive.')), true)
    })

    it('allows empty prefix at admin_db.', () => {
        assert.equal(allowsEmptyPrefixCompletion(fromCtx('admin_db.')), true)
    })

    it('allows empty prefix at hive.a003.', () => {
        assert.equal(allowsEmptyPrefixCompletion(fromCtx('hive.a003.')), true)
    })
})
