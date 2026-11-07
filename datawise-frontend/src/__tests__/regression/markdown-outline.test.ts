import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildMarkdownOutlineTree,
    extractMarkdownOutline,
    findOutlineIdAtLine,
} from '@/core/markdown/markdown-outline'
import {renderSafeMarkdown} from '@/core/markdown/safe-markdown'

describe('extractMarkdownOutline', () => {
    it('extracts ATX headings with line numbers and nested levels', () => {
        const src = [
            '### k8s',
            'echo hi',
            '',
            '### trino',
            'jdbc://x',
            '',
            '## Parent',
            '### Child',
            '# Root',
        ].join('\n')
        const items = extractMarkdownOutline(src)
        assert.deepEqual(
            items.map((h) => ({level: h.level, text: h.text, line: h.line})),
            [
                {level: 3, text: 'k8s', line: 1},
                {level: 3, text: 'trino', line: 4},
                {level: 2, text: 'Parent', line: 7},
                {level: 3, text: 'Child', line: 8},
                {level: 1, text: 'Root', line: 9},
            ],
        )
    })

    it('skips headings inside fenced code blocks', () => {
        const src = '```\n### not-a-heading\n```\n\n### real\n'
        const items = extractMarkdownOutline(src)
        assert.equal(items.length, 1)
        assert.equal(items[0].text, 'real')
        assert.equal(items[0].line, 5)
    })

    it('assigns ids that match rendered heading anchors', () => {
        const src = '### k8s\n\n### k8s\n\n### 中文标题\n'
        const items = extractMarkdownOutline(src)
        const html = renderSafeMarkdown(src)
        for (const item of items) {
            assert.match(html, new RegExp(`id="${item.id}"`))
        }
        assert.equal(items[0].id, 'k8s')
        assert.equal(items[1].id, 'k8s-2')
        assert.equal(items[2].id, '中文标题')
    })

    it('builds a nested tree by heading level', () => {
        const items = extractMarkdownOutline('# A\n## B\n### C\n## D\n# E\n')
        const tree = buildMarkdownOutlineTree(items)
        assert.equal(tree.length, 2)
        assert.equal(tree[0].text, 'A')
        assert.equal(tree[0].children.length, 2)
        assert.equal(tree[0].children[0].text, 'B')
        assert.equal(tree[0].children[0].children[0].text, 'C')
        assert.equal(tree[0].children[1].text, 'D')
        assert.equal(tree[1].text, 'E')
    })

    it('finds the active outline id for a source line', () => {
        const items = extractMarkdownOutline('# A\n\n## B\n\ntext\n\n## C\n')
        assert.equal(findOutlineIdAtLine(items, 1), items[0].id)
        assert.equal(findOutlineIdAtLine(items, 3), items[1].id)
        assert.equal(findOutlineIdAtLine(items, 5), items[1].id)
        assert.equal(findOutlineIdAtLine(items, 7), items[2].id)
        assert.equal(findOutlineIdAtLine([], 1), null)
    })
})
