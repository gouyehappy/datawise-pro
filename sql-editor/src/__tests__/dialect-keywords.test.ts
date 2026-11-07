import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {resolveSqlParserDialect} from '../sql-parser/dialect.ts'
import {resolveSqlDialectFile} from '../completion/dialect-aliases.ts'
import {loadSqlParserBackend} from '../sql-parser/load-parser.ts'
import {extractParserKeywords} from '../completion/parser/parser-keywords.ts'

async function keywordCount(dialect: string, sql: string, column: number): Promise<number> {
    const parserDialect = resolveSqlParserDialect(dialect)
    const backend = await loadSqlParserBackend(parserDialect)
    const suggestions = backend.getSuggestionAtCaretPosition(sql, {lineNumber: 1, column})
    return extractParserKeywords(suggestions ?? {}).length
}

describe('dialect keyword suggestions', () => {
    it('maps mysql-compatible engines to mysql parser', () => {
        for (const dialect of ['starrocks', 'doris', 'mariadb', 'oceanbase']) {
            assert.equal(resolveSqlParserDialect(dialect), 'mysql', dialect)
            assert.equal(resolveSqlDialectFile(dialect), 'mysql', dialect)
        }
    })

    it('postgresql resolves to postgresql parser', () => {
        assert.equal(resolveSqlParserDialect('postgresql'), 'postgresql')
        assert.equal(resolveSqlDialectFile('postgresql'), 'postgresql')
    })

    it('mysql and postgresql parsers return keywords at SELECT list', async () => {
        const mysqlCount = await keywordCount('mysql', 'SELECT ', 7)
        const pgCount = await keywordCount('postgresql', 'SELECT ', 7)
        assert.ok(mysqlCount > 0, `mysql keywords: ${mysqlCount}`)
        assert.ok(pgCount > 0, `postgresql keywords: ${pgCount}`)
    })

    it('generic parser returns fewer keywords than mysql at SELECT list', async () => {
        const mysqlCount = await keywordCount('mysql', 'SELECT ', 7)
        const genericCount = await keywordCount('clickhouse', 'SELECT ', 7)
        assert.ok(mysqlCount > genericCount, `mysql=${mysqlCount}, generic=${genericCount}`)
    })
})
