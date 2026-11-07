import assert from 'node:assert'
import {describe, it} from 'node:test'
import {mergeSnippetSources} from '../completion/snippet-sources.ts'

describe('mergeSnippetSources', () => {
    it('dedupes slot and global snippets by label', () => {
        const slot = [
            {label: 'sel', insertText: 'SELECT slot version'},
            {label: 'selj', insertText: 'SELECT join slot'},
        ]
        const global = [
            {label: 'sel', insertText: 'SELECT global version'},
            {label: 'self', insertText: 'SELECT limit global'},
            {label: 'win', insertText: 'ROW_NUMBER global'},
        ]

        const results = mergeSnippetSources(slot, global, true, '')
        const labels = results.map((item) => item.label.toLowerCase())

        assert.equal(labels.length, new Set(labels).size)
        assert.equal(labels.filter((label) => label === 'sel').length, 1)
        assert.equal(results.find((item) => item.label === 'sel')?.insertText, 'SELECT slot version')
        assert.ok(labels.includes('self'))
        assert.ok(labels.includes('win'))
    })

    it('filters by prefix after dedupe', () => {
        const slot = [{label: 'sel', insertText: 'a'}]
        const global = [{label: 'sub', insertText: 'b'}]

        const results = mergeSnippetSources(slot, global, true, 'sel')
        assert.deepEqual(results.map((item) => item.label), ['sel'])
    })
})
