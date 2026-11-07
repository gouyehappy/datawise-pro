import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    listSqlDialectFunctionSignatures,
    parseFunctionFile,
    parseFunctionLine,
} from '../completion/function-config.ts'
import {setSqlCompletionDialect} from '../completion/keyword-config.ts'

describe('function-config', () => {
    it('parseFunctionLine supports name | signature | returns', () => {
        assert.deepEqual(parseFunctionLine('SUM | (expr) | number'), {
            name: 'SUM',
            signature: '(expr)',
            returns: 'number',
            insertText: undefined,
        })
        assert.deepEqual(parseFunctionLine('NOW'), {
            name: 'NOW',
            signature: undefined,
            returns: undefined,
            insertText: undefined,
        })
    })

    it('parseFunctionFile reads [functions] section', () => {
        const config = parseFunctionFile(`
# comment
[functions]
COUNT | (expr) | number
DATE_ADD | (date: datetime, INTERVAL expr unit) | datetime
`)
        assert.equal(config.functions.length, 2)
        assert.equal(config.functions[0]?.name, 'COUNT')
        assert.equal(config.functions[1]?.name, 'DATE_ADD')
    })

    it('merges common + mysql dialect functions', () => {
        const mysql = listSqlDialectFunctionSignatures('mysql')
        assert.ok(mysql.some((fn) => fn.name === 'COUNT'))
        assert.ok(mysql.some((fn) => fn.name === 'DATE_ADD'))
        assert.ok(!mysql.some((fn) => fn.name === 'DATEADD'))
    })

    it('sqlserver dialect includes DATEADD', () => {
        const sqlserver = listSqlDialectFunctionSignatures('sqlserver')
        assert.ok(sqlserver.some((fn) => fn.name === 'DATEADD'))
        assert.ok(sqlserver.some((fn) => fn.name === 'COUNT'))
    })

    it('postgresql dialect includes COALESCE', () => {
        const pg = listSqlDialectFunctionSignatures('postgresql')
        assert.ok(pg.some((fn) => fn.name === 'COALESCE'))
        assert.ok(pg.some((fn) => fn.name === 'COUNT'))
    })

    it('follows active dialect from setSqlCompletionDialect', () => {
        setSqlCompletionDialect('mysql')
        const mysql = listSqlDialectFunctionSignatures()
        assert.ok(mysql.some((fn) => fn.name === 'DATE_FORMAT'))

        setSqlCompletionDialect('sqlserver')
        const sqlserver = listSqlDialectFunctionSignatures()
        assert.ok(sqlserver.some((fn) => fn.name === 'ISNULL'))
        assert.ok(!sqlserver.some((fn) => fn.name === 'DATE_FORMAT'))
    })
})
