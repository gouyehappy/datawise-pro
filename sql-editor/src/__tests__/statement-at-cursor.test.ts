import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {resolveStatementAtCursor} from '../utils/statement-at-cursor.ts'

describe('resolveStatementAtCursor', () => {
    it('returns multi-line statement when cursor is on FROM line', () => {
        const sql = 'SELECT *\nFROM cdp_segment t1;'
        const cursor = sql.indexOf('FROM') + 2
        const result = resolveStatementAtCursor(sql, cursor)
        assert.equal(result?.sql, 'SELECT *\nFROM cdp_segment t1')
        assert.equal(result?.startLine, 1)
        assert.equal(result?.endLine, 2)
        assert.equal(result?.anchorLine, 1)
    })

    it('returns only the statement that contains the cursor', () => {
        const sql = 'SELECT 1;\nSELECT 2'
        const cursor = sql.indexOf('2')
        const result = resolveStatementAtCursor(sql, cursor)
        assert.equal(result?.sql, 'SELECT 2')
        assert.equal(result?.startLine, 2)
    })

    it('ignores semicolons inside string literals', () => {
        const sql = "SELECT ';' AS x FROM t"
        const cursor = sql.indexOf('FROM') + 1
        const result = resolveStatementAtCursor(sql, cursor)
        assert.equal(result?.sql, sql)
    })

    it('returns null between statements on blank lines', () => {
        const sql = 'SELECT 1;\n\nSELECT 2'
        const cursor = sql.indexOf('\n\n') + 1
        const result = resolveStatementAtCursor(sql, cursor)
        assert.equal(result, null)
    })

    it('returns null for comment-only lines outside statements', () => {
        const sql = '-- note\nSELECT 1'
        const cursor = 1
        const result = resolveStatementAtCursor(sql, cursor)
        assert.equal(result, null)
    })
})

describe('resolveStatementAtCursor — multi-line Ctrl+R', () => {
    const sql = [
        'SELECT *',
        'FROM aaflinktest.product t1',
        'LEFT JOIN aaflinktest.order_detail t2 ON t1.product_id = t2.product_id',
        "WHERE t1.product_id = 'P001';",
    ].join('\n')

    function assertFullStatement(cursor: number) {
        const result = resolveStatementAtCursor(sql, cursor)
        assert.ok(result, `cursor=${cursor}`)
        assert.match(result!.sql, /^SELECT \*/i)
        assert.match(result!.sql, /LEFT JOIN/i)
        assert.match(result!.sql, /WHERE t1\.product_id/i)
        assert.equal(result!.startLine, 1)
        assert.equal(result!.endLine, 4)
    }

    it('光标在 SELECT 行 → 整句', () => {
        assertFullStatement(sql.indexOf('SELECT') + 3)
    })

    it('光标在 FROM 行 → 整句', () => {
        assertFullStatement(sql.indexOf('FROM') + 2)
    })

    it('光标在 LEFT JOIN 行 → 整句', () => {
        assertFullStatement(sql.indexOf('LEFT JOIN') + 5)
    })

    it('光标在 WHERE 行 → 整句', () => {
        assertFullStatement(sql.indexOf('WHERE') + 2)
    })

    it('光标在分号上 → 整句', () => {
        assertFullStatement(sql.lastIndexOf(';'))
    })

    it('光标在分号之后（文末）→ 整句', () => {
        assertFullStatement(sql.length)
    })

    it('前有其它语句时仍只取当前整句', () => {
        const multi = `SELECT 1;\n\n${sql}`
        const cursor = multi.indexOf('LEFT JOIN') + 4
        const result = resolveStatementAtCursor(multi, cursor)
        assert.ok(result)
        assert.match(result!.sql, /LEFT JOIN/i)
        assert.equal(result!.sql.includes('SELECT 1'), false)
    })
})
