import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {isSemicolonInCode} from '../utils/sql-literal-scan.ts'

describe('isSemicolonInCode', () => {
    it('treats semicolon in single-quoted string as literal', () => {
        const sql = "SELECT ';'"
        const index = sql.indexOf(';')
        assert.equal(isSemicolonInCode(sql, index), false)
    })

    it('treats trailing statement semicolon as code', () => {
        const sql = 'SELECT 1;'
        const index = sql.length - 1
        assert.equal(isSemicolonInCode(sql, index), true)
    })
})
