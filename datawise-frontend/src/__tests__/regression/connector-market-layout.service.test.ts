import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    defaultConnectorMarketOrder,
    isConnectorMarketViewMode,
    mergeConnectorMarketOrder,
    moveConnectorInOrder,
    resolveConnectorCardSize,
    sortConnectorMarketEntries,
} from '@/features/datasource/services/connector-market-layout.service'
import type {ConnectorMarketEntry} from '@/features/datasource/types/datasource.types'

const entries: ConnectorMarketEntry[] = [
    {id: 'mysql', label: 'MySQL', primary: true, available: true, capabilities: []},
    {id: 'oracle', label: 'Oracle', primary: true, available: false, capabilities: [], installHint: 'jar'},
    {id: 'redis', label: 'Redis', primary: false, available: true, capabilities: []},
    {id: 'kafka', label: 'Kafka', primary: false, available: false, capabilities: []},
]

describe('connector-market-layout.service', () => {
    it('sorts featured: primary then available then name', () => {
        const sorted = sortConnectorMarketEntries(entries, 'featured')
        assert.deepEqual(sorted.map((e) => e.id), ['mysql', 'oracle', 'redis', 'kafka'])
    })

    it('sorts by name', () => {
        const sorted = sortConnectorMarketEntries(entries, 'name')
        assert.deepEqual(sorted.map((e) => e.id), ['kafka', 'mysql', 'oracle', 'redis'])
    })

    it('sorts by custom order and fills missing ids', () => {
        const sorted = sortConnectorMarketEntries(entries, 'custom', ['redis', 'mysql'])
        assert.equal(sorted[0]?.id, 'redis')
        assert.equal(sorted[1]?.id, 'mysql')
        assert.ok(sorted.map((e) => e.id).includes('oracle'))
    })

    it('moves connectors within a custom order', () => {
        const order = defaultConnectorMarketOrder(entries)
        const next = moveConnectorInOrder(order, 'kafka', 'mysql')
        assert.equal(next[0], 'kafka')
        assert.equal(next[1], 'mysql')
    })

    it('merges preferred order with newly seen connectors', () => {
        const merged = mergeConnectorMarketOrder(['redis'], entries)
        assert.equal(merged[0], 'redis')
        assert.equal(merged.length, entries.length)
    })

    it('picks varied card sizes on the standalone board', () => {
        assert.equal(resolveConnectorCardSize(entries[0]!, 0, {standalone: true}), 'hero')
        assert.equal(resolveConnectorCardSize(entries[1]!, 1, {standalone: true}), 'tall')
        assert.equal(resolveConnectorCardSize(entries[3]!, 3, {standalone: true}), 'compact')
    })

    it('forces list size when view mode is list', () => {
        assert.equal(
            resolveConnectorCardSize(entries[0]!, 0, {standalone: true, viewMode: 'list'}),
            'list',
        )
        assert.ok(isConnectorMarketViewMode('list'))
        assert.equal(isConnectorMarketViewMode('masonry'), false)
    })
})
