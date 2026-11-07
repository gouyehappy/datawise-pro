import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TableRelationsResult} from '@/shared/api/types'
import {
    buildTableRelationGraph,
    hasRelationGraphNeighborhood,
    layoutInitialRelationGraphPositions,
    relationGraphColumnAnchor,
    relationGraphColumnRowIndex,
    relationGraphEdgeAnchors,
    relationGraphNodeHeight,
} from '@/features/workspace/services/table-relation-graph.service'

describe('table-relation-graph.service', () => {
    it('builds center, reference, and referrer nodes with edges', () => {
        const relations: TableRelationsResult = {
            tableName: 'orders',
            references: [{
                constraintName: 'fk_user',
                sourceTable: 'orders',
                sourceColumns: 'user_id',
                targetTable: 'public.users',
                targetColumns: 'id',
            }],
            referencedBy: [{
                constraintName: 'fk_order',
                sourceTable: 'order_items',
                sourceColumns: 'order_id',
                targetTable: 'orders',
                targetColumns: 'id',
            }],
        }

        const graph = buildTableRelationGraph(relations)
        assert.equal(graph.centerTableName, 'orders')
        assert.equal(graph.nodes.length, 3)
        assert.equal(graph.edges.length, 2)
        assert.equal(graph.edges[0]?.sourceColumn, 'user_id')
        assert.equal(graph.edges[0]?.targetColumn, 'id')
        assert.equal(hasRelationGraphNeighborhood(graph), true)
    })

    it('anchors edges to fk column rows on node sides', () => {
        const graph = buildTableRelationGraph({
            tableName: 'orders',
            references: [{
                constraintName: 'fk_user',
                sourceTable: 'orders',
                sourceColumns: 'user_id',
                targetTable: 'users',
                targetColumns: 'id',
            }],
            referencedBy: [],
        })
        graph.nodes.forEach((node) => {
            node.columns = node.tableName === 'orders'
                ? [
                    {name: 'id', dataType: 'bigint', keyType: 'PRI', highlighted: false},
                    {name: 'user_id', dataType: 'bigint', keyType: 'MUL', highlighted: true},
                ]
                : [{name: 'id', dataType: 'bigint', keyType: 'PRI', highlighted: true}]
        })
        const positions = layoutInitialRelationGraphPositions(graph, 800, 600)
        const edge = graph.edges[0]
        const fromNode = graph.nodes.find((node) => node.id === edge.fromNodeId)!
        const toNode = graph.nodes.find((node) => node.id === edge.toNodeId)!
        const anchors = relationGraphEdgeAnchors(
            edge,
            positions[edge.fromNodeId],
            fromNode,
            positions[edge.toNodeId],
            toNode,
        )

        assert.equal(relationGraphColumnRowIndex(fromNode, 'user_id'), 1)
        assert.equal(relationGraphColumnRowIndex(toNode, 'id'), 0)
        assert.ok(anchors.start.x > positions[edge.fromNodeId].x)
        assert.ok(anchors.end.x < positions[edge.toNodeId].x + 208)
        assert.ok(Math.abs(anchors.start.y - (positions[edge.fromNodeId].y + 32 + 1 * 20 + 10)) < 1)
    })

    it('lays out one node per graph entry', () => {
        const graph = buildTableRelationGraph({
            tableName: 'orders',
            references: [{
                constraintName: 'fk_user',
                sourceTable: 'orders',
                sourceColumns: 'user_id',
                targetTable: 'users',
                targetColumns: 'id',
            }],
            referencedBy: [],
        })
        graph.nodes.forEach((node) => {
            node.columns = [{name: 'id', dataType: 'bigint', keyType: 'PRI', highlighted: true}]
        })
        const positions = layoutInitialRelationGraphPositions(graph, 800, 600)
        assert.equal(Object.keys(positions).length, graph.nodes.length)
        assert.ok(positions['table:orders'])
        assert.ok(positions['table:users'])
        const centerNode = graph.nodes.find((node) => node.role === 'center')
        assert.ok(centerNode)
        const centerPos = positions['table:orders']
        assert.ok(centerPos)
        const centerAnchor = relationGraphColumnAnchor(centerPos, centerNode, 'user_id', 'right')
        assert.ok(centerAnchor.x > centerPos.x)
        assert.ok(relationGraphNodeHeight(centerNode) > 48)
    })

    it('reports empty neighborhood when only center exists', () => {
        const graph = buildTableRelationGraph({
            tableName: 'solo',
            references: [],
            referencedBy: [],
        })
        assert.equal(graph.nodes.length, 1)
        assert.equal(hasRelationGraphNeighborhood(graph), false)
    })
})
