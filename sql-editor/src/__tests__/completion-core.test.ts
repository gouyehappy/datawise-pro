/**
 * sql-scan 单元测试。
 * Bug 场景回归请维护在 regression.test.ts。
 */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    codeParenDepthAt,
    isCursorInStringOrComment,
    maskNonCodeRegions,
    sqlScanModeAt,
} from '../completion/sql-scan.ts'
import {parseTableAliases} from '../utils/parse-references.ts'

describe('sql-scan', () => {
    it('treats cursor inside single-quoted string as non-code', () => {
        const sql = "SELECT * FROM t WHERE note = 'draft|'"
        const offset = sql.indexOf('|')
        assert.equal(isCursorInStringOrComment(sql.replace('|', ''), offset), true)
    })

    it('ignores parentheses inside string for paren depth', () => {
        const sql = "WHERE x = '(a|'"
        const offset = sql.indexOf('|')
        const clean = sql.replace('|', '')
        assert.equal(codeParenDepthAt(clean, offset), 0)
    })

    it('masks dollar-quoted literals', () => {
        const sql = 'WHERE x = $$hello$$ AND |'
        const masked = maskNonCodeRegions(sql.replace('|', ''))
        assert.match(masked, /WHERE x =\s+AND/)
    })

    it('detects MySQL hash comment', () => {
        const sql = 'SELECT 1 # comment\n|'
        const offset = sql.indexOf('|')
        assert.equal(sqlScanModeAt(sql.replace('|', ''), offset), 'code')
    })
})

describe('parse-references', () => {
    it('parses table aliases from scoped segment', () => {
        const segment = 'SELECT user_id FROM items WHERE '
        const aliases = parseTableAliases(segment, ['users', 'orders', 'items'])
        assert.equal(aliases.items, 'items')
        assert.equal(aliases.orders, undefined)
    })
})
