import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildFunctionInsertSnippet,
    formatFunctionDisplaySignature,
    signaturePlaceholderText,
} from '../completion/function-presentation.ts'

describe('function-presentation', () => {
    it('formats display signature with parentheses', () => {
        assert.equal(formatFunctionDisplaySignature('[DISTINCT] expr'), '([DISTINCT] expr)')
        assert.equal(formatFunctionDisplaySignature('(expr)'), '(expr)')
    })

    it('derives snippet placeholder from optional DISTINCT', () => {
        assert.equal(signaturePlaceholderText('([DISTINCT] expr)'), 'DISTINCT expr')
        assert.equal(signaturePlaceholderText('(expr)'), 'expr')
    })

    it('builds SUM snippet like Chat2DB selection', () => {
        assert.equal(
            buildFunctionInsertSnippet({
                name: 'SUM',
                signature: '([DISTINCT] expr)',
                returns: 'number',
            }),
            'SUM(${1:DISTINCT expr})',
        )
    })

    it('builds COUNT snippet with expr placeholder', () => {
        assert.equal(
            buildFunctionInsertSnippet({
                name: 'COUNT',
                signature: '(expr)',
                returns: 'number',
            }),
            'COUNT(${1:expr})',
        )
    })

    it('honors explicit insert template from config', () => {
        assert.equal(
            buildFunctionInsertSnippet({
                name: 'NOW',
                insertText: 'NOW()',
            }),
            'NOW()',
        )
    })
})
