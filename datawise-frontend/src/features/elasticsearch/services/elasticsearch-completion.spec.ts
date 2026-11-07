import {describe, expect, it} from 'vitest'
import {
    applyElasticsearchRestCompletion,
    suggestElasticsearchRestCompletions,
} from '@/features/elasticsearch/services/elasticsearch-completion'

describe('elasticsearch-completion', () => {
    it('suggests static paths for empty input', () => {
        const suggestions = suggestElasticsearchRestCompletions('')
        expect(suggestions.some((item) => item.includes('/_cat/indices'))).toBe(true)
    })

    it('includes index-scoped suggestions', () => {
        const suggestions = suggestElasticsearchRestCompletions('GET /logs', ['logs'])
        expect(suggestions.some((item) => item.includes('/logs/_mapping'))).toBe(true)
    })

    it('replaces the current line when applying a completion', () => {
        expect(applyElasticsearchRestCompletion('GET /_c', 'GET /_cat/indices')).toBe('GET /_cat/indices')
        expect(applyElasticsearchRestCompletion('GET /a\nGET /_c', 'GET /_cat/indices')).toBe(
            'GET /a\nGET /_cat/indices',
        )
    })
})
