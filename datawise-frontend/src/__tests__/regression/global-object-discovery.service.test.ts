import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    discoveryHitsToSearchEntries,
    mergeDiscoveryEntries,
} from '@/features/explorer/services/global-object-discovery.service'
import type {GlobalObjectSearchEntry} from '@/features/explorer/services/global-object-search.service'
import type {DiscoveryHit} from '@/features/platform/types/platform.types'

describe('global-object-discovery.service', () => {
    it('maps metric hits with owner', () => {
        const hits: DiscoveryHit[] = [{
            kind: 'metric',
            id: 'm1',
            name: 'gmv',
            qualifiedLabel: 'shop.gmv',
            connectionId: 'c1',
            connectionLabel: 'Shop',
            database: 'shop',
            owner: 'alice',
            subtitle: 'gross',
            score: 100,
        }]
        const entries = discoveryHitsToSearchEntries(hits)
        assert.equal(entries.length, 1)
        assert.equal(entries[0].kind, 'metric')
        assert.equal(entries[0].owner, 'alice')
        assert.equal(entries[0].source, 'discovery')
    })

    it('dedupes tables already in explorer index', () => {
        const local: GlobalObjectSearchEntry[] = [{
            nodeId: 'n1',
            kind: 'table',
            name: 'orders',
            qualifiedLabel: 'shop.orders',
            connectionId: 'c1',
            connectionLabel: 'Shop',
            database: 'shop',
            source: 'explorer',
            searchText: 'orders',
        }]
        const discovery = discoveryHitsToSearchEntries([
            {
                kind: 'table',
                id: 'cached-orders',
                name: 'orders',
                qualifiedLabel: 'shop.orders',
                connectionId: 'c1',
                connectionLabel: 'Shop',
                database: 'shop',
                score: 80,
            },
            {
                kind: 'metric',
                id: 'm1',
                name: 'gmv',
                qualifiedLabel: 'shop.gmv',
                connectionId: 'c1',
                connectionLabel: 'Shop',
                database: 'shop',
                score: 90,
            },
        ])
        const merged = mergeDiscoveryEntries(local, discovery)
        assert.equal(merged.filter((e) => e.kind === 'table').length, 1)
        assert.equal(merged.some((e) => e.kind === 'metric'), true)
    })
})
