import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    categoryForConnectorId,
    countEntriesByCategory,
    filterEntriesByCategory,
    visibleCategoriesForEntries,
} from '@/features/datasource/services/connector-market-category.service'
import type {ConnectorMarketEntry} from '@/features/datasource/types/datasource.types'

const entries: ConnectorMarketEntry[] = [
    {id: 'mysql', label: 'MySQL', primary: true, available: true, capabilities: []},
    {id: 'clickhouse', label: 'ClickHouse', primary: false, available: false, capabilities: []},
    {id: 'dm', label: 'DM', primary: false, available: true, capabilities: []},
    {id: 'kafka', label: 'Kafka', primary: false, available: false, capabilities: []},
]

describe('connector-market-category.service', () => {
    it('maps connector ids onto db-type categories', () => {
        assert.equal(categoryForConnectorId('mysql'), 'sql')
        assert.equal(categoryForConnectorId('clickhouse'), 'analytics')
        assert.equal(categoryForConnectorId('dm'), 'domestic')
        assert.equal(categoryForConnectorId('kafka'), 'mq')
        assert.equal(categoryForConnectorId('unknown-thing'), 'sql')
    })

    it('lists only non-empty categories in order', () => {
        const keys = visibleCategoriesForEntries(entries).map((cat) => cat.key)
        assert.deepEqual(keys, ['sql', 'analytics', 'domestic', 'mq'])
    })

    it('filters and counts by category', () => {
        const analytics = filterEntriesByCategory(entries, 'analytics')
        assert.equal(analytics.length, 1)
        assert.equal(analytics[0]?.id, 'clickhouse')
        assert.deepEqual(countEntriesByCategory(entries, 'all'), {
            total: 4,
            available: 2,
            pending: 2,
        })
        assert.deepEqual(countEntriesByCategory(entries, 'sql'), {
            total: 1,
            available: 1,
            pending: 0,
        })
    })
})
