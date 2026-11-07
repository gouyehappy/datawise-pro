import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {isSqlEditorAiReady, isSqlEditorAiCompletionEnabled, resolveSqlEditorAiSettings} from '../ai/settings.ts'
import {stripSqlCodeFence} from '../ai/openai-compatible.ts'
import {buildSchemaSummary} from '../ai/build-sql-prompt.ts'

describe('sql-editor ai settings', () => {
    it('isSqlEditorAiReady requires enabled + baseUrl + apiKey', () => {
        assert.equal(isSqlEditorAiReady({enabled: false, baseUrl: 'http://x', apiKey: 'k'}), false)
        assert.equal(isSqlEditorAiReady({enabled: true, baseUrl: '', apiKey: 'k'}), false)
        assert.equal(isSqlEditorAiReady({enabled: true, baseUrl: 'http://x', apiKey: ''}), false)
        assert.equal(isSqlEditorAiReady({enabled: true, baseUrl: 'http://x', apiKey: 'k'}), true)
    })

    it('resolveSqlEditorAiSettings fills defaults', () => {
        const resolved = resolveSqlEditorAiSettings({enabled: true})
        assert.equal(resolved.enabled, true)
        assert.equal(resolved.model, 'gpt-4o-mini')
        assert.equal(resolved.completionEnabled, true)
    })

    it('isSqlEditorAiCompletionEnabled respects completionEnabled', () => {
        const ready = {enabled: true, baseUrl: 'http://x', apiKey: 'k'}
        assert.equal(isSqlEditorAiCompletionEnabled(ready), true)
        assert.equal(isSqlEditorAiCompletionEnabled({...ready, completionEnabled: false}), false)
        assert.equal(isSqlEditorAiCompletionEnabled({...ready, enabled: false}), false)
    })
})

describe('stripSqlCodeFence', () => {
    it('removes markdown fences', () => {
        assert.equal(stripSqlCodeFence('```sql\nSELECT 1\n```'), 'SELECT 1')
    })
})

describe('buildSchemaSummary', () => {
    it('lists tables and columns', () => {
        const text = buildSchemaSummary({
            tables: ['orders'],
            columns: {orders: [{name: 'id', type: 'bigint', pk: true}]},
        })
        assert.match(text, /orders\(id bigint PK\)/)
    })
})
