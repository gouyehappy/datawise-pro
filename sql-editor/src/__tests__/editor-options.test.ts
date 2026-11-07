import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {resolveSqlEditorMonacoOptions} from '../constants/editor-options.ts'

describe('resolveSqlEditorMonacoOptions', () => {
    it('keeps showWords false when partial suggest overrides are merged', () => {
        const options = resolveSqlEditorMonacoOptions({
            suggest: {
                showKeywords: true,
                showSnippets: true,
            },
        })
        assert.equal(options.wordBasedSuggestions, 'off')
        assert.equal(options.suggest?.showWords, false)
    })
})
