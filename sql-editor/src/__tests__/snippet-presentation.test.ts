import assert from 'node:assert'
import {describe, it} from 'node:test'
import {
    formatSnippetSqlPreview,
    presentSnippet,
    resolveSnippetSummary,
    simplifySnippetInsertText,
} from '../completion/snippet-presentation.ts'
import {snippetCompletionPresentation} from '../completion/completion-labels.ts'

const SEL_SNIPPET =
    'SELECT ${2:*}\nFROM ${1:table} ${3:t1}\nWHERE ${4:1=1}'

describe('snippet-presentation', () => {
    it('simplifies Monaco placeholder syntax', () => {
        const sql = simplifySnippetInsertText(SEL_SNIPPET)
        assert.match(sql, /SELECT \*\s+FROM table/)
        assert.match(sql, /WHERE 1=1/)
    })

    it('builds inline SQL preview for completion list', () => {
        const preview = formatSnippetSqlPreview(SEL_SNIPPET, 'inline')
        assert.match(preview, /^SELECT \* FROM table/)
        assert.ok(!preview.includes('\n'))
    })

    it('keeps completion list compact; SQL lives in documentation panel', () => {
        const item = snippetCompletionPresentation('sel', 'Standard SELECT', 'Snippet', SEL_SNIPPET)
        assert.equal(item.label.label, 'sel')
        assert.equal(item.label.detail, undefined)
        assert.equal(item.label.description, 'Snippet')
        assert.equal(item.detail, 'Standard SELECT')
        assert.match(item.documentation.value, /SELECT \*/)
        assert.ok(!item.documentation.value.includes('```'))
        assert.ok(!item.documentation.value.includes('Standard SELECT'))
    })

    it('resolves summary from i18n with SQL fallback', () => {
        const summary = resolveSnippetSummary('en', {label: 'sel', insertText: SEL_SNIPPET, detail: ''})
        assert.match(summary, /SELECT/i)
    })

    it('presentSnippet builds tooltip with SQL body', () => {
        const item = presentSnippet(
            {label: 'crt', insertText: 'CREATE TABLE ${1:table} (\n  ${2:id} BIGINT PRIMARY KEY\n)'},
            'zh-CN',
            '片段',
        )
        assert.match(item.tooltip, /CREATE TABLE/)
        assert.equal(item.completionLabel.label, 'crt')
        assert.equal(item.completionLabel.description, '片段')
        assert.equal(item.completionDetail, item.summary)
        assert.match(item.documentation.value, /CREATE TABLE/)
    })
})
