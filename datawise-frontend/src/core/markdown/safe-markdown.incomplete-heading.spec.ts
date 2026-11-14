import {describe, expect, it} from 'vitest'
import {renderSafeMarkdown} from '@/core/markdown/safe-markdown'
import {extractMarkdownOutline} from '@/core/markdown/markdown-outline'

/** Fail the test if render takes longer than this (hang detector). */
function assertFinishesQuickly(run: () => string | unknown, label: string): string {
    const started = Date.now()
    const result = run()
    const elapsed = Date.now() - started
    expect(elapsed, `${label} took ${elapsed}ms`).toBeLessThan(1_000)
    return typeof result === 'string' ? result : ''
}

describe('renderSafeMarkdown progress / hang guards', () => {
    it('incomplete ATX headings (## / # / ### ) do not hang', () => {
        const html = assertFinishesQuickly(() => renderSafeMarkdown('## '), '## ')
        expect(html).toContain('<h2')
        expect(html).toContain('</h2>')

        const mixed = assertFinishesQuickly(
            () => renderSafeMarkdown('#\n\nhello\n\n### \n\nworld\n\n##\t\n'),
            'mixed bare headings',
        )
        expect(mixed).toContain('hello')
        expect(mixed).toContain('world')
    })

    it('unclosed fence / quote / list / html / table fragments finish', () => {
        const samples = [
            '```sql\nselect 1',
            '>',
            '> ',
            '- ',
            '* ',
            '+ ',
            '1. ',
            '---|---',
            '| a |\n| --- |',
            '| only-header |',
            '<div>',
            '<div>\ntext',
            '<br>',
            '***',
            '---',
            '___',
            '####### too many hashes stay paragraph-ish or progress',
            '## incomplete then\npara',
            '[unterminated link](http://example.com',
            '![alt](http://example.com',
            '**bold',
            '_em',
            '`code',
            '```\n# not a heading inside fence\n```\n## ',
        ]
        for (const sample of samples) {
            assertFinishesQuickly(() => renderSafeMarkdown(sample), JSON.stringify(sample))
        }
    })

    it('large pathological mix stays bounded', () => {
        const lines: string[] = []
        for (let n = 0; n < 200; n += 1) {
            lines.push('## ')
            lines.push(`# ${n}`)
            lines.push('- ')
            lines.push('1. ')
            lines.push('>')
            lines.push('```')
            lines.push('code')
            lines.push('| a | b |')
            lines.push('| - | - |')
            lines.push('<span>x</span>')
            lines.push('')
        }
        const html = assertFinishesQuickly(() => renderSafeMarkdown(lines.join('\n')), 'large mix')
        expect(html.length).toBeGreaterThan(0)
    })

    it('outline scan also finishes on incomplete headings + unclosed fence', () => {
        assertFinishesQuickly(
            () => extractMarkdownOutline('## \n# Title\n```\n# inside\n'),
            'outline',
        )
        const items = extractMarkdownOutline('## \n# Title\n### Sub')
        expect(items.map((item) => item.text)).toEqual(['Title', 'Sub'])
    })
})
