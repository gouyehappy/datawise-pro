import {describe, it, beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {
    extractReferencedTables,
    getSqlParser,
    resetSqlParserCache,
    resolveSqlParserDialect,
} from '../sql-parser/index.ts'

describe('sql-parser', () => {
    beforeEach(() => {
        resetSqlParserCache()
    })

    it('resolveSqlParserDialect maps db types', () => {
        assert.equal(resolveSqlParserDialect('mysql'), 'mysql')
        assert.equal(resolveSqlParserDialect('flink'), 'flink')
        assert.equal(resolveSqlParserDialect('spark'), 'spark')
        assert.equal(resolveSqlParserDialect('presto'), 'trino')
        assert.equal(resolveSqlParserDialect('oracle'), 'generic')
        assert.equal(resolveSqlParserDialect('clickhouse'), 'generic')
    })

    it('MySQL validate catches syntax errors', async () => {
        const parser = await getSqlParser('mysql')
        assert.ok(parser.validate('selec 1 from t').length > 0)
        assert.equal(parser.validate('SELECT 1').length, 0)
    })

    it('Flink splitStatements splits on semicolons', async () => {
        const parser = await getSqlParser('flink')
        const slices = parser.splitStatements('SHOW TABLES;\nSELECT 1;')
        assert.ok(slices)
        assert.equal(slices!.length, 2)
        assert.match(slices![0].text, /SHOW TABLES/)
    })

    it('extractReferencedTables from entities', async () => {
        const parser = await getSqlParser('mysql')
        const entities = parser.getAllEntities('SELECT a.id FROM users a JOIN orders o ON a.id = o.user_id')
        const tables = extractReferencedTables(entities)
        assert.ok(tables.some((t) => t.toLowerCase().includes('users')))
        assert.ok(tables.some((t) => t.toLowerCase().includes('orders')))
    })

    it('parser instances are cached per dialect', async () => {
        const a = await getSqlParser('mysql')
        const b = await getSqlParser('mysql')
        assert.equal(a, b)
        const c = await getSqlParser('flink')
        assert.notEqual(a, c)
    })
})
