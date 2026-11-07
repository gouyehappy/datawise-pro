import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    collectPreExecuteDiagnostics,
    mapDiagnosticToEditorLine,
    summarizePreExecuteDiagnostics,
} from '@/features/workspace/services/sql-pre-execute-diagnostics.service'
import type {SqlEditorSchema} from '@datawise/sql-editor/types'

const schema: SqlEditorSchema = {
    tables: ['orders', 'users'],
    columns: {
        orders: [{name: 'id'}, {name: 'amount'}],
        users: [{name: 'id'}, {name: 'name'}],
    },
}

describe('sql-pre-execute-diagnostics', () => {
    it('returns empty when schema missing', () => {
        assert.deepEqual(collectPreExecuteDiagnostics('SELECT 1', null), [])
        assert.deepEqual(collectPreExecuteDiagnostics('SELECT 1', {tables: [], columns: {}}), [])
    })

    it('flags unknown columns and summarizes', () => {
        const diagnostics = collectPreExecuteDiagnostics(
            'SELECT o.missing FROM orders o',
            schema,
        )
        assert.equal(diagnostics.length, 1)
        const summary = summarizePreExecuteDiagnostics(diagnostics)
        assert.equal(summary?.count, 1)
        assert.match(summary?.firstMessage ?? '', /missing/i)
    })

    it('maps diagnostic line with anchor', () => {
        assert.equal(mapDiagnosticToEditorLine(2, 10), 11)
        assert.equal(mapDiagnosticToEditorLine(1, null), 1)
    })
})
