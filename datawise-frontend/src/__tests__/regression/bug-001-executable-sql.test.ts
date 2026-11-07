import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {resolveExecutableSql} from '../../features/workspace/services/resolve-executable-sql.ts'

describe('BUG-001: resolveExecutableSql ignores non-string overrides', () => {
    it('uses trimmed string override when provided', () => {
        const result = resolveExecutableSql('  SELECT 1  ', () => 'ignored')
        assert.equal(result.sql, 'SELECT 1')
    })

    it('ignores MouseEvent-like objects and uses selection fallback', () => {
        const fakeEvent = {
            type: 'click', preventDefault() {
            }
        }
        const result = resolveExecutableSql(fakeEvent, () => 'SELECT 2')
        assert.equal(result.sql, 'SELECT 2')
    })

    it('returns empty when override and selection are blank', () => {
        const result = resolveExecutableSql('   ', () => '')
        assert.equal(result.sql, '')
    })

    it('uses getSelectedText when no override', () => {
        const result = resolveExecutableSql(undefined, () => 'SELECT 3')
        assert.equal(result.sql, 'SELECT 3')
    })
})

describe('BUG-004: toolbar execute falls back to full document when selection empty', () => {
    it('does not fall back without fallback options', () => {
        const result = resolveExecutableSql(undefined, () => '')
        assert.equal(result.sql, '')
    })

    it('falls back to full editor text for toolbar run when selection is empty', () => {
        const result = resolveExecutableSql(undefined, () => '', {
            fallbackToFullDocument: () => 'SELECT * FROM t',
        })
        assert.equal(result.sql, 'SELECT * FROM t')
    })

    it('prefers selection over full document fallback', () => {
        const result = resolveExecutableSql(undefined, () => 'SELECT 1', {
            fallbackToFullDocument: () => 'SELECT * FROM t',
        })
        assert.equal(result.sql, 'SELECT 1')
    })

    it('string override still works for context menu run selection', () => {
        const result = resolveExecutableSql('SELECT 1', () => '')
        assert.equal(result.sql, 'SELECT 1')
    })
})

describe('BUG-018: execute current line SQL without selection', () => {
    it('prefers selection over current line', () => {
        const result = resolveExecutableSql(undefined, () => 'SELECT 1', {
            fallbackToCurrentLineSql: () => 'SELECT 2',
            fallbackToFullDocument: () => 'SELECT 3',
        })
        assert.equal(result.sql, 'SELECT 1')
    })

    it('uses current line when selection is empty', () => {
        const result = resolveExecutableSql(undefined, () => '', {
            fallbackToCurrentLineSql: () => 'select * FROM cdp_segment cs limit 4;',
            getCurrentLineNumber: () => 3,
            fallbackToFullDocument: () => 'SELECT 1;\nselect * FROM cdp_segment cs limit 4;\n--',
        })
        assert.equal(result.sql, 'select * FROM cdp_segment cs limit 4;')
        assert.equal(result.anchorLine, 3)
    })

    it('prefers current line over full document', () => {
        const result = resolveExecutableSql(undefined, () => '', {
            fallbackToCurrentLineSql: () => 'SELECT 2',
            fallbackToFullDocument: () => 'SELECT 1; SELECT 2; SELECT 3',
        })
        assert.equal(result.sql, 'SELECT 2')
    })

    it('falls back to full document when current line is blank or comment-only', () => {
        const result = resolveExecutableSql(undefined, () => '', {
            fallbackToCurrentLineSql: () => '',
            fallbackToFullDocument: () => 'SELECT * FROM t',
        })
        assert.equal(result.sql, 'SELECT * FROM t')
    })

    it('records selection anchor line when executing selection', () => {
        const result = resolveExecutableSql(undefined, () => 'SELECT 1', {
            getSelectionStartLine: () => 2,
            fallbackToCurrentLineSql: () => 'SELECT 9',
        })
        assert.equal(result.sql, 'SELECT 1')
        assert.equal(result.anchorLine, 2)
    })
})

describe('Wave B: explicit execute modes', () => {
    it('selection mode ignores statement/document fallbacks', () => {
        const result = resolveExecutableSql(undefined, () => '', {
            mode: 'selection',
            fallbackToCurrentLineSql: () => 'SELECT 2',
            fallbackToFullDocument: () => 'SELECT 3',
        })
        assert.equal(result.sql, '')
    })

    it('statement mode uses current statement only', () => {
        const result = resolveExecutableSql(undefined, () => 'SELECT 1', {
            mode: 'statement',
            fallbackToCurrentLineSql: () => 'SELECT 2',
            getCurrentLineNumber: () => 4,
            fallbackToFullDocument: () => 'SELECT 3',
        })
        assert.equal(result.sql, 'SELECT 2')
        assert.equal(result.anchorLine, 4)
    })

    it('all mode uses full document even when selection exists', () => {
        const result = resolveExecutableSql(undefined, () => 'SELECT 1', {
            mode: 'all',
            fallbackToCurrentLineSql: () => 'SELECT 2',
            fallbackToFullDocument: () => 'SELECT 3;\nSELECT 4',
        })
        assert.equal(result.sql, 'SELECT 3;\nSELECT 4')
    })
})
