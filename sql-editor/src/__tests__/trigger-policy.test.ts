import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {shouldAbortCompletion} from '../completion/policy/guards.ts'
import {
    bypassesAutocompleteSuppress,
    isMandatoryColumnSuggestContext,
    lineBeforeIsColumnRef,
    shouldScheduleEditorAutoSuggest,
} from '../completion/trigger-policy.ts'

describe('trigger-policy', () => {
    it('schedules suggest on dot and letters', () => {
        assert.equal(shouldScheduleEditorAutoSuggest('.'), true)
        assert.equal(shouldScheduleEditorAutoSuggest('ord'), true)
        assert.equal(shouldScheduleEditorAutoSuggest(' '), false)
        assert.equal(shouldScheduleEditorAutoSuggest(','), false)
    })

    it('dot bypasses autocomplete suppress', () => {
        assert.equal(bypassesAutocompleteSuppress('.'), true)
        assert.equal(bypassesAutocompleteSuppress(' '), false)
    })

    it('detects alias. at line tail', () => {
        assert.equal(lineBeforeIsColumnRef('ORDER BY ord.'), true)
        assert.equal(lineBeforeIsColumnRef('WHERE ord.id'), true)
        assert.equal(lineBeforeIsColumnRef('ORDER BY ord'), false)
    })
})

describe('column_ref mandatory suggest', () => {
    const TABLES = ['orders', 'users']
    const COLUMNS = {
        orders: [{name: 'id'}, {name: 'user_id'}],
        users: [{name: 'id'}],
    }
    const TriggerCharacter = 1

    it('ORDER BY alias. resolves column_ref and never aborts', () => {
        const sql =
            'SELECT * FROM users us LEFT JOIN orders ord ON ord.user_id = us.id WHERE ord.id = 123 GROUP BY ord.id ORDER BY ord.'
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
        assert.equal(isMandatoryColumnSuggestContext(ctx), true)
        assert.equal(ctx.resolvedTable, 'orders')
        assert.equal(
            shouldAbortCompletion({sql, offset, prefix: '', ctx, triggerKind: TriggerCharacter}),
            false,
        )
    })

    it('WHERE alias. still mandatory in long query', () => {
        const sql = 'SELECT * FROM orders ord WHERE ord.'
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
        assert.equal(isMandatoryColumnSuggestContext(ctx), true)
        assert.equal(
            shouldAbortCompletion({sql, offset, prefix: '', ctx, triggerKind: TriggerCharacter}),
            false,
        )
    })
})
