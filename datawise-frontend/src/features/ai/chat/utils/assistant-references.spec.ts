import {describe, expect, it} from 'vitest'
import {extractUrlReferences} from './assistant-references'

describe('extractUrlReferences', () => {
    it('extracts markdown and bare URLs without duplicates', () => {
        const refs = extractUrlReferences(
            'See [Docs](https://example.com/docs) and https://example.com/docs also https://other.test/a.',
        )
        expect(refs).toEqual([
            {url: 'https://example.com/docs', title: 'Docs'},
            {url: 'https://other.test/a', title: 'other.test'},
        ])
    })

    it('returns empty for blank text', () => {
        expect(extractUrlReferences('   ')).toEqual([])
    })
})
