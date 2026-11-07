import assert from 'node:assert'
import {describe, it} from 'node:test'
import {
    clampSqlEditorFontSize,
    normalizeSqlEditorFormatterLayer,
    resolveSqlEditorFormatterSettings,
} from '../config/formatter-settings.ts'

describe('formatter settings', () => {
    it('clamps font size to 12–24', () => {
        assert.equal(clampSqlEditorFontSize(10), 12)
        assert.equal(clampSqlEditorFontSize(30), 24)
        assert.equal(clampSqlEditorFontSize(15.6), 16)
    })

    it('normalizes partial formatter layer', () => {
        assert.deepEqual(
            normalizeSqlEditorFormatterLayer({keywordCase: 'preserve', tabWidth: 99 as 2}),
            {keywordCase: 'preserve'},
        )
        assert.deepEqual(
            resolveSqlEditorFormatterSettings({useLibrary: false}),
            {
                useLibrary: false,
                formatAsYouType: true,
                keywordCase: 'upper',
                identifierCase: 'preserve',
                functionCase: 'preserve',
                tabWidth: 2,
                useTabs: false,
                indentStyle: 'standard',
                logicalOperatorNewline: 'before',
                linesBetweenQueries: 2,
                denseOperators: false,
                newlineBeforeSemicolon: false,
            },
        )
    })
})
