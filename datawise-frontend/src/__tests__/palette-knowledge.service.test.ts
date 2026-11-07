import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    extractSqlFromKnowledgeDefinition,
    isPaletteKnowledgeMode,
    searchKnowledgeEntries,
} from '@/features/layout/services/palette-knowledge.service'
import type {AiKnowledgeEntry} from '@/features/ai/knowledge/types/ai-knowledge.types'

const entries: AiKnowledgeEntry[] = [
    {
        id: 'kb-1',
        term: 'GMV daily',
        definition: 'SELECT sum(amount) FROM orders\n\n-- duration=12ms',
        synonyms: ['成交额'],
        relatedTables: ['orders'],
        database: 'shop',
    },
]

describe('palette-knowledge.service', () => {
    it('detects knowledge mode prefix', () => {
        assert.equal(isPaletteKnowledgeMode('# gmv'), true)
        assert.equal(isPaletteKnowledgeMode('table'), false)
    })

    it('searches by term and synonyms', () => {
        const results = searchKnowledgeEntries(entries, '成交额')
        assert.equal(results.length, 1)
        assert.equal(results[0]?.id, 'kb-1')
    })

    it('extracts sql body without metadata comment', () => {
        assert.equal(
            extractSqlFromKnowledgeDefinition(entries[0]!.definition),
            'SELECT sum(amount) FROM orders',
        )
    })
})
