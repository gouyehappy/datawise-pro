import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    resolveConnectorMarketHighlights,
    resolveConnectorMarketIntro,
} from '@/features/datasource/services/connector-market-intro.service'
import type {ConnectorMarketEntry} from '@/features/datasource/types/datasource.types'

const entry: ConnectorMarketEntry = {
    id: 'starrocks',
    label: 'StarRocks',
    primary: false,
    available: true,
    capabilities: [],
}

describe('connector-market-intro.service', () => {
    it('prefers connector-specific intro when present', () => {
        const text = resolveConnectorMarketIntro(
            entry,
            (key, values) => (key.endsWith('starrocks') ? 'specific' : `fallback:${values?.name}`),
            (key) => key.endsWith('starrocks'),
        )
        assert.equal(text, 'specific')
    })

    it('falls back to category intro', () => {
        const text = resolveConnectorMarketIntro(
            entry,
            (key) => (key.includes('introCategories.analytics') ? 'analytics-blurb' : key),
            (key) => key.includes('introCategories.analytics'),
        )
        assert.equal(text, 'analytics-blurb')
    })

    it('splits highlight lines', () => {
        const lines = resolveConnectorMarketHighlights(
            entry,
            () => 'One; Two；Three',
            () => true,
        )
        assert.deepEqual(lines, ['One', 'Two', 'Three'])
    })
})
