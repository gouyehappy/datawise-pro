/**
 * 格式化范围策略：选区 / 当前语句，不整文件重写
 */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    findStatementContainingOffset,
    indexSqlStatements,
} from '../utils/sql-statement-index.ts'
import {formatSql} from '../utils/format.ts'

describe('format scope — selection / current statement', () => {
    it('多语句文档中可定位光标所在语句范围', () => {
        const sql = 'SELECT 1;\n\nSELECT id FROM users WHERE a=1;\n\nDELETE FROM t;'
        const statements = indexSqlStatements(sql)
        assert.equal(statements.length, 3)

        const cursor = sql.indexOf('WHERE')
        const span = findStatementContainingOffset(statements, cursor)
        assert.ok(span)
        assert.match(span!.sql, /SELECT id FROM users/i)
        assert.equal(span!.sql.includes('DELETE'), false)
        assert.equal(span!.sql.includes('SELECT 1'), false)

        const formatted = formatSql(span!.sql)
        assert.match(formatted, /SELECT/i)
        assert.match(formatted, /FROM/i)
    })

    it('格式化单句不影响其它语句文本', () => {
        const sql = 'select 1 from dual; select * from t;'
        const statements = indexSqlStatements(sql)
        assert.equal(statements.length, 2)
        const first = statements[0]!
        const second = statements[1]!
        const formattedFirst = formatSql(first.sql)
        const rebuilt = sql.slice(0, first.startOffset) + formattedFirst + sql.slice(first.endOffset)
        assert.ok(rebuilt.includes(second.sql) || rebuilt.toLowerCase().includes('select * from t'))
        assert.equal(rebuilt.includes('select 1 from dual'), false)
    })
})
