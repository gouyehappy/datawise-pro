import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildDataCatalogFacetOptions,
    canJumpLineage,
    discoveryHitRowKey,
    filterDiscoveryHitsByFacets,
    normalizeRelatedTableName,
    pickLineageJumpTarget,
    resolveDataCatalogFacetOptions,
    resolveDiscoveryHitColumnPeek,
    resolveLineageImpactSource,
    listRelatedTableChoices,
    needsRelatedTablePicker,
    nextDiscoveryOffset,
    toDiscoverySearchFilters,
    toggleFacetValue,
} from '@/features/discovery/services/data-catalog.service'
import type {DiscoveryHit} from '@/features/platform/types/platform.types'
import type {TreeNode} from '@/core/types'

describe('data-catalog.service', () => {
    const tableHit: DiscoveryHit = {
        kind: 'table',
        id: 'n1',
        name: 'orders',
        qualifiedLabel: 'app.orders',
        connectionId: 'c1',
        connectionLabel: 'prod',
        database: 'app',
        score: 10,
    }

    const hits: DiscoveryHit[] = [
        tableHit,
        {
            kind: 'view',
            id: 'n2',
            name: 'orders_v',
            qualifiedLabel: 'app.orders_v',
            connectionId: 'c1',
            connectionLabel: 'prod',
            database: 'app',
            score: 8,
        },
        {
            kind: 'metric',
            id: 'm1',
            name: 'gmv',
            qualifiedLabel: 'shop.gmv',
            connectionId: 'c2',
            connectionLabel: 'staging',
            database: 'shop',
            owner: 'alice',
            score: 12,
        },
    ]

    it('pickLineageJumpTarget prefers exact name then single downstream', () => {
        assert.equal(pickLineageJumpTarget([]), null)
        assert.equal(
            pickLineageJumpTarget([
                {modelName: 'orders_vm', fileName: 'orders_vm.sql', staleSidecar: false},
                {modelName: 'orders_agg', fileName: 'orders_agg.sql', staleSidecar: false},
            ], 'orders_agg')?.modelName,
            'orders_agg',
        )
        assert.equal(
            pickLineageJumpTarget([
                {modelName: 'only', fileName: 'only.sql', staleSidecar: false},
            ])?.modelName,
            'only',
        )
        assert.equal(
            pickLineageJumpTarget([
                {modelName: 'a', fileName: 'a.sql', staleSidecar: false},
                {modelName: 'b', fileName: 'b.sql', staleSidecar: false},
            ]),
            null,
        )
    })

    it('canJumpLineage for table/view and metrics with relatedTables', () => {
        assert.equal(canJumpLineage(tableHit), true)
        assert.equal(canJumpLineage({...tableHit, kind: 'metric'}), false)
        assert.equal(canJumpLineage({
            ...tableHit,
            kind: 'metric',
            name: 'gmv',
            relatedTables: ['orders'],
        }), true)
        assert.equal(canJumpLineage({...tableHit, connectionId: ''}), false)
        assert.ok(discoveryHitRowKey(tableHit).includes('orders'))
    })

    it('resolveLineageImpactSource uses first related table for metrics', () => {
        assert.deepEqual(resolveLineageImpactSource(tableHit), {
            connectionId: 'c1',
            database: 'app',
            name: 'orders',
        })
        assert.equal(resolveLineageImpactSource({
            kind: 'metric',
            id: 'm1',
            name: 'gmv',
            qualifiedLabel: 'shop.gmv',
            connectionId: 'c2',
            connectionLabel: 'staging',
            database: 'shop',
            score: 1,
            relatedTables: [],
        }), null)
        assert.deepEqual(resolveLineageImpactSource({
            kind: 'metric',
            id: 'm1',
            name: 'gmv',
            qualifiedLabel: 'shop.gmv',
            connectionId: 'c2',
            connectionLabel: 'staging',
            database: 'shop',
            score: 1,
            relatedTables: ['shop.orders', 'payments'],
        }), {
            connectionId: 'c2',
            database: 'shop',
            name: 'orders',
        })
        assert.equal(normalizeRelatedTableName('shop.orders', 'shop'), 'orders')
        assert.equal(normalizeRelatedTableName('public.orders', 'shop'), 'orders')
    })

    it('listRelatedTableChoices dedupes and needsRelatedTablePicker gates multi-table metrics', () => {
        const metric: DiscoveryHit = {
            kind: 'metric',
            id: 'm1',
            name: 'gmv',
            qualifiedLabel: 'shop.gmv',
            connectionId: 'c2',
            connectionLabel: 'staging',
            database: 'shop',
            score: 1,
            relatedTables: ['shop.orders', 'orders', 'payments', ''],
        }
        const choices = listRelatedTableChoices(metric)
        assert.deepEqual(choices.map((item) => item.name), ['orders', 'payments'])
        assert.equal(needsRelatedTablePicker(metric), true)
        assert.equal(needsRelatedTablePicker({...metric, relatedTables: ['orders']}), false)
        assert.deepEqual(resolveLineageImpactSource(metric, 'payments'), {
            connectionId: 'c2',
            database: 'shop',
            name: 'payments',
        })
        assert.equal(resolveLineageImpactSource(metric, 'missing'), null)
    })

    it('buildDataCatalogFacetOptions counts kinds/connections/owners/tags', () => {
        const tagged: DiscoveryHit[] = [
            ...hits,
            {
                ...hits[0],
                id: 'n3',
                name: 'payments',
                tags: ['pii', 'finance'],
            },
        ]
        const options = buildDataCatalogFacetOptions(tagged)
        assert.deepEqual(options.kinds.map((item) => item.value), ['table', 'view', 'metric'])
        assert.equal(options.connections.length, 2)
        assert.equal(options.owners.length, 1)
        assert.equal(options.owners[0].value, 'alice')
        assert.equal(options.tags.length, 2)
        assert.ok(options.tags.some((item) => item.value === 'pii'))
    })

    it('filterDiscoveryHitsByFacets applies AND across facet groups including tags', () => {
        const taggedHits: DiscoveryHit[] = [
            {...hits[0], tags: ['pii']},
            hits[1],
            {...hits[2], tags: ['kpi']},
        ]
        const filtered = filterDiscoveryHitsByFacets(taggedHits, {
            kinds: ['metric'],
            connectionIds: ['c2'],
            owners: ['alice'],
            tags: ['kpi'],
        })
        assert.equal(filtered.length, 1)
        assert.equal(filtered[0].name, 'gmv')
        assert.equal(
            filterDiscoveryHitsByFacets(taggedHits, {
                kinds: ['table'],
                connectionIds: ['c2'],
                owners: [],
                tags: [],
            }).length,
            0,
        )
    })

    it('toDiscoverySearchFilters omits empty facet groups', () => {
        assert.equal(
            toDiscoverySearchFilters({kinds: [], connectionIds: [], owners: [], tags: []}),
            undefined,
        )
        assert.deepEqual(
            toDiscoverySearchFilters({kinds: ['table'], connectionIds: [], owners: [], tags: ['pii']}),
            {kinds: ['table'], connectionIds: undefined, owners: undefined, tags: ['pii']},
        )
    })

    it('resolveDataCatalogFacetOptions prefers server facets', () => {
        const resolved = resolveDataCatalogFacetOptions(
            {
                kinds: [{value: 'table', label: 'table', count: 9}],
                connections: [],
                owners: [],
                tags: [{value: 'pii', label: 'pii', count: 3}],
            },
            hits,
        )
        assert.equal(resolved.kinds[0].count, 9)
        assert.equal(resolved.tags[0].value, 'pii')
    })

    it('toggleFacetValue adds and removes', () => {
        assert.deepEqual(toggleFacetValue(['table'], 'view'), ['table', 'view'])
        assert.deepEqual(toggleFacetValue(['table', 'view'], 'table'), ['view'])
    })

    it('nextDiscoveryOffset advances while hasMore', () => {
        assert.equal(nextDiscoveryOffset({offset: 0, hits: [1, 2], hasMore: true}), 2)
        assert.equal(nextDiscoveryOffset({offset: 40, hits: [1], hasMore: false}), null)
    })

    it('resolveDiscoveryHitColumnPeek prefers explorer tree over hit payload', () => {
        const hit: DiscoveryHit = {
            ...tableHit,
            columns: [{name: 'cached_only', type: 'text'}],
        }
        const tree: TreeNode[] = [{
            id: 'c1',
            label: 'prod',
            type: 'connection',
            children: [{
                id: 'db-app',
                label: 'app',
                type: 'database',
                children: [{
                    id: 'folder-tables',
                    label: 'tables',
                    type: 'folder',
                    children: [{
                        id: 'tbl-orders',
                        label: 'orders',
                        type: 'table',
                        children: [{
                            id: 'cols',
                            label: 'columns',
                            type: 'columns',
                            children: [
                                {id: 'col-id', label: 'id', type: 'primary_key', meta: 'bigint · pk'},
                                {id: 'col-name', label: 'name', type: 'column', meta: 'varchar'},
                            ],
                        }],
                    }],
                }],
            }],
        }]
        assert.deepEqual(resolveDiscoveryHitColumnPeek(hit, tree), [
            {name: 'id', type: 'bigint'},
            {name: 'name', type: 'varchar'},
        ])
    })

    it('resolveDiscoveryHitColumnPeek falls back to hit columns', () => {
        const hit: DiscoveryHit = {
            ...tableHit,
            columns: [{name: 'id', type: 'int'}],
        }
        assert.deepEqual(resolveDiscoveryHitColumnPeek(hit, []), [{name: 'id', type: 'int'}])
    })

    it('resolveDiscoveryHitColumnPeek returns empty for metrics', () => {
        const metricHit = hits.find((item) => item.kind === 'metric')
        assert.deepEqual(resolveDiscoveryHitColumnPeek(metricHit, []), [])
    })
})
