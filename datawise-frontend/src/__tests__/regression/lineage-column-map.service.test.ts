import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildColumnLineageMap,
    hasColumnLineage,
    layoutColumnLineageMap,
} from '@/features/lineage/services/lineage-column-map.service'
import type {LineageGraph} from '@/features/lineage/types/lineage.types'

function sampleGraph(): LineageGraph {
    return {
        root: {id: 'model:orders_summary', label: 'orders_summary', kind: 'model'},
        columnMappings: [
            {
                outputColumn: 'order_id',
                sources: [{
                    schema: null,
                    table: 'orders',
                    column: 'id',
                    qualifiedName: 'orders.id',
                    kind: 'physical_table',
                }],
                expression: null,
            },
            {
                outputColumn: 'full_name',
                sources: [
                    {
                        schema: null,
                        table: 'users',
                        column: 'first_name',
                        qualifiedName: 'users.first_name',
                        kind: 'physical_table',
                    },
                    {
                        schema: null,
                        table: 'users',
                        column: 'last_name',
                        qualifiedName: 'users.last_name',
                        kind: 'physical_table',
                    },
                ],
                expression: 'CONCAT(first_name, last_name)',
            },
        ],
        nodes: [],
        edges: [],
        meta: {
            sqlHash: 'abc',
            parsedAt: '2026-01-01',
            dialect: 'mysql',
            parser: 'jsqlparser',
            parserVersion: '5.3',
            depth: 3,
            status: 'complete',
            warnings: [],
        },
    }
}

describe('lineage-column-map.service', () => {
    it('builds output to source mappings', () => {
        const map = buildColumnLineageMap(sampleGraph())
        assert.notEqual(map, null)
        assert.equal(hasColumnLineage(map), true)
        assert.equal(map?.outputs.length, 2)

        const orderId = map?.outputs.find((row) => row.column === 'order_id')
        assert.equal(orderId?.sources.length, 1)
        assert.equal(orderId?.sources[0].qualifiedName, 'orders.id')

        const fullName = map?.outputs.find((row) => row.column === 'full_name')
        assert.equal(fullName?.sources.length, 2)
        assert.ok(fullName?.transform?.includes('CONCAT'))
    })

    it('lays out ER entities with field links and expression labels', () => {
        const map = buildColumnLineageMap(sampleGraph())
        const layout = layoutColumnLineageMap(map)
        assert.equal(layout?.entities.some((entity) => entity.side === 'source'), true)
        assert.equal(layout?.entities.some((entity) => entity.side === 'output'), true)
        assert.ok((layout?.links.length ?? 0) > 0)
        assert.equal(layout?.links.every((link) => link.path.startsWith('M ')), true)

        const transformLink = layout?.links.find((link) => link.transform)
        assert.ok(transformLink?.expression?.includes('CONCAT'))

        const labelLink = layout?.links.find((link) => link.showExpression)
        assert.ok(labelLink?.labelLines[0]?.includes('CONCAT'))
        assert.ok((labelLink?.labelX ?? 0) > 0)
    })
})
