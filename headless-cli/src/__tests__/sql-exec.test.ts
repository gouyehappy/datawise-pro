import assert from 'node:assert/strict'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, it} from 'node:test'
import {readSqlFromFile} from '../commands/sql-exec.js'
import {formatSqlResult} from '../format.js'

describe('sql exec', () => {
    it('reads SQL from file', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dw-cli-'))
        const file = join(dir, 'query.sql')
        writeFileSync(file, 'select 1;\n', 'utf8')
        assert.equal(readSqlFromFile(file), 'select 1;')
    })

    it('formats human-readable result', () => {
        const output = formatSqlResult({sql: 'select 1', rowCount: 1, durationMs: 12}, false)
        assert.match(output, /OK: 1 rows in 12ms/)
    })
})
