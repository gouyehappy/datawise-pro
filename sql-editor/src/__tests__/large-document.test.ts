import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    SQL_LARGE_DOC_CHARS,
    SQL_LARGE_DOC_LINES,
    isLargeSqlDocument,
    shouldRunLiveColumnDiagnostics,
} from '../constants/large-document.ts'

describe('large-document (T-ED-1)', () => {
    it('flags documents at char or line thresholds', () => {
        assert.equal(isLargeSqlDocument('x'.repeat(SQL_LARGE_DOC_CHARS)), true)
        assert.equal(isLargeSqlDocument('short', SQL_LARGE_DOC_LINES), true)
        assert.equal(isLargeSqlDocument('select 1', 10), false)
    })

    it('auto mode skips live diagnostics on large docs', () => {
        const large = 'a'.repeat(SQL_LARGE_DOC_CHARS)
        assert.equal(shouldRunLiveColumnDiagnostics('auto', large), false)
        assert.equal(shouldRunLiveColumnDiagnostics('on', large), true)
        assert.equal(shouldRunLiveColumnDiagnostics('off', 'select 1'), false)
        assert.equal(shouldRunLiveColumnDiagnostics('auto', 'select 1'), true)
        assert.equal(shouldRunLiveColumnDiagnostics(undefined, 'select 1'), true)
    })
})
