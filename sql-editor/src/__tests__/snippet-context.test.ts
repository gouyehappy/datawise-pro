import assert from 'node:assert'
import {describe, it} from 'node:test'
import {isSnippetExpansionContext} from '../completion/snippet-context.ts'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {analyzeCompletion} from '../completion/core/snapshot.ts'

describe('snippet-context — unified snippet gating', () => {
    it('blocks statement_start snippets after DDL keywords', () => {
        assert.equal(
            isSnippetExpansionContext('ddl', 'statement_start', 'DROP TABLE IF EXISTS c'),
            false,
        )
    })

    it('allows snippets at empty editor', () => {
        assert.equal(isSnippetExpansionContext('empty', 'statement_start', ''), true)
        assert.equal(isSnippetExpansionContext('unknown', 'statement_start', 'sel'), true)
    })

    it('DROP TABLE IF EXISTS c resolves to ddl.pick_table with from slot', () => {
        const sql = 'DROP TABLE IF EXISTS c'
        const offset = sql.length
        const snapshot = analyzeCompletion(
            sql,
            offset,
            ['customers', 'categories'],
            {},
            analyzeSqlCompletionContext,
        )
        assert.equal(snapshot.context.statement, 'ddl')
        assert.equal(snapshot.context.slot, 'from')
        assert.equal(snapshot.plan.stage, 'ddl.pick_table')
        assert.ok(snapshot.plan.collectors.includes('tables'))
        assert.equal(snapshot.plan.collectors.includes('snippets'), false)
    })
})
