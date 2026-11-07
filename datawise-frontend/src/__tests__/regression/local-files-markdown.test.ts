import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    absolutePathToFileUrl,
    renderLocalMarkdown,
} from '@/features/local-files/services/local-files-markdown'

describe('renderLocalMarkdown', () => {
    it('renders headings, lists, and emphasis', () => {
        const html = renderLocalMarkdown('# Title\n\nHello **world** and `code`\n\n- a\n- b\n')
        assert.match(html, /<h1 id="title" class="lf-md__h">Title<\/h1>/)
        assert.match(html, /<strong>world<\/strong>/)
        assert.match(html, /<code>code<\/code>/)
        assert.match(html, /<ul class="lf-md__list">/)
        assert.match(html, /<li>a<\/li>/)
    })

    it('escapes raw HTML and blocks unsafe links', () => {
        const html = renderLocalMarkdown('Click <script>alert(1)</script> and [x](javascript:alert(1))')
        assert.doesNotMatch(html, /<script>/i)
        assert.doesNotMatch(html, /href="javascript:/)
        assert.match(html, / and x</)
    })

    it('allows https links and fenced code', () => {
        const html = renderLocalMarkdown('[docs](https://example.com)\n\n```sql\nselect 1\n```\n')
        assert.match(html, /href="https:\/\/example\.com"/)
        assert.match(html, /rel="noopener noreferrer"/)
        assert.match(html, /<pre class="lf-md__code"/)
        assert.match(html, /select 1/)
    })

    it('passes through allowlisted README HTML blocks', () => {
        const src = [
            '<p align="center">',
            '  <img src="https://img.shields.io/badge/x-1-blue" alt="Badge" />',
            '</p>',
            '',
            'Hello **DataWise**',
        ].join('\n')
        const html = renderLocalMarkdown(src)
        assert.match(html, /<p align="center">/)
        assert.match(html, /src="https:\/\/img\.shields\.io\/badge\/x-1-blue"/)
        assert.match(html, /<strong>DataWise<\/strong>/)
        assert.doesNotMatch(html, /&lt;p/)
    })

    it('resolves relative image urls', () => {
        const html = renderLocalMarkdown(
            '![logo](docs/logo.png)\n\n<img src="./a.png" width="88" />\n',
            {resolveUrl: (url) => absolutePathToFileUrl(`C:/ws/${url.replace(/^\.\//, '')}`)},
        )
        assert.match(html, /src="file:\/\/\/C:\/ws\/docs\/logo\.png"/)
        assert.match(html, /src="file:\/\/\/C:\/ws\/a\.png"/)
        assert.match(html, /width="88"/)
    })

    it('returns empty for blank input', () => {
        assert.equal(renderLocalMarkdown('   \n'), '')
    })
})
