import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {SchemaRelationsResult} from '@/shared/api/types'
import {
    buildSchemaRelationGraph,
    hasSchemaErGraphContent,
    layoutSchemaRelationGraphPositions,
    schemaErNodeHeight,
    SCHEMA_ER_NODE_WIDTH,
} from '@/features/workspace/services/schema-relation-graph.service'

describe('schema-relation-graph.service', () => {
    it('builds nodes for all tables and fk edges with focus table centered role', () => {
        const schema: SchemaRelationsResult = {
            database: 'shop',
            tables: ['users', 'orders', 'order_items'],
            edges: [{
                constraintName: 'fk_user',
                sourceTable: 'orders',
                sourceColumns: 'user_id',
                targetTable: 'users',
                targetColumns: 'id',
            }, {
                constraintName: 'fk_order',
                sourceTable: 'order_items',
                sourceColumns: 'order_id',
                targetTable: 'orders',
                targetColumns: 'id',
            }],
        }

        const graph = buildSchemaRelationGraph(schema, 'orders')
        assert.equal(graph.centerTableName, 'orders')
        assert.equal(graph.nodes.length, 3)
        assert.equal(graph.edges.length, 2)
        assert.equal(graph.nodes.find((n) => n.tableName === 'orders')?.role, 'center')
        assert.equal(hasSchemaErGraphContent(graph), true)
    })

    it('layers connected tables left-to-right and isolates unrelated tables below', () => {
        const schema: SchemaRelationsResult = {
            database: 'shop',
            tables: ['users', 'orders', 'logs'],
            edges: [{
                constraintName: 'fk_user',
                sourceTable: 'orders',
                sourceColumns: 'user_id',
                targetTable: 'users',
                targetColumns: 'id',
            }],
        }
        const graph = buildSchemaRelationGraph(schema, 'orders')
        const layout = layoutSchemaRelationGraphPositions(graph)
        const users = layout.positions['table:users']
        const orders = layout.positions['table:orders']
        const logs = layout.positions['table:logs']

        assert.ok(users)
        assert.ok(orders)
        assert.ok(logs)
        assert.ok(users.x > orders.x)
        assert.ok(logs.y > users.y)
        assert.ok(layout.width >= 1200)
        assert.ok(layout.height >= 720)
    })

    it('grows node height with column rows', () => {
        const graph = buildSchemaRelationGraph({database: 'shop', tables: ['users'], edges: []}, 'users')
        const emptyHeight = schemaErNodeHeight(graph.nodes[0]!)
        graph.nodes[0]!.columns = [
            {name: 'id', dataType: 'BIGINT', keyType: 'PRI', highlighted: true},
            {name: 'name', dataType: 'VARCHAR', keyType: null, highlighted: false},
        ]
        assert.ok(schemaErNodeHeight(graph.nodes[0]!) > emptyHeight)
        assert.equal(SCHEMA_ER_NODE_WIDTH, 208)
    })
})
