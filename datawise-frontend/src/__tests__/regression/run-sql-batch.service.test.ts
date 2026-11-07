import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {resolveRunSqlBatch} from '@/features/workspace/services/run-sql-batch.service'

describe('run-sql-batch.service', () => {
    it('returns empty array for blank sql', () => {
        assert.deepEqual(resolveRunSqlBatch('   '), [])
    })

    it('keeps single statement when only trailing semicolon', () => {
        assert.deepEqual(resolveRunSqlBatch('SELECT 1;'), ['SELECT 1'])
    })

    it('splits multiple statements on semicolons', () => {
        assert.deepEqual(resolveRunSqlBatch('SELECT 1; SELECT 2'), ['SELECT 1', 'SELECT 2'])
    })
})
