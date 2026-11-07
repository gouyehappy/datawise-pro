import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {extractExecutableLineSql} from '@datawise/sql-editor/utils/current-line-sql'

describe('BUG-018: execute current line SQL without selection', () => {
    it('returns full trimmed line regardless of trailing semicolon position', () => {
        assert.equal(
            extractExecutableLineSql('select * FROM cdp_segment cs limit 4;'),
            'select * FROM cdp_segment cs limit 4;',
        )
    })

    it('returns empty for blank lines', () => {
        assert.equal(extractExecutableLineSql(''), '')
        assert.equal(extractExecutableLineSql('   '), '')
    })

    it('returns empty for comment-only lines so execution does not pick up --', () => {
        assert.equal(extractExecutableLineSql('--'), '')
        assert.equal(extractExecutableLineSql('  -- note'), '')
    })

    it('does not include content from other lines', () => {
        const line3 = 'select * FROM cdp_segment cs limit 4;'
        const line5 = '--'
        assert.notEqual(extractExecutableLineSql(line3), extractExecutableLineSql(line5))
        assert.equal(extractExecutableLineSql(line3).includes('--'), false)
    })
})
