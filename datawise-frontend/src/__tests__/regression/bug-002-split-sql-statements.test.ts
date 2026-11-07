import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {splitSqlStatements} from '../../features/workspace/services/split-sql-statements.ts'

describe('BUG-002: splitSqlStatements for single vs multi SQL tabs', () => {
    it('returns one statement when there is no semicolon', () => {
        const parts = splitSqlStatements('SELECT 1')
        assert.equal(parts.length, 1)
        assert.equal(parts[0], 'SELECT 1')
    })

    it('returns one statement when trailing semicolon only', () => {
        const parts = splitSqlStatements('SELECT 1;')
        assert.equal(parts.length, 1)
        assert.equal(parts[0], 'SELECT 1')
    })

    it('returns multiple statements split on code semicolons', () => {
        const parts = splitSqlStatements('SELECT 1; SELECT 2')
        assert.deepEqual(parts, ['SELECT 1', 'SELECT 2'])
    })

    it('does not split semicolons inside single-quoted strings', () => {
        const parts = splitSqlStatements("SELECT ';'; SELECT 2")
        assert.deepEqual(parts, ["SELECT ';'", 'SELECT 2'])
    })
})
