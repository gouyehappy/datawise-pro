import assert from 'node:assert/strict'
import {describe, test} from 'node:test'
import type {TableColumnDetail} from '@/shared/api/types'
import {
    buildGraphNodeColumns,
    enrichRelationGraphWithColumns,
    parseRelationColumnList,
} from '@/features/workspace/services/table-relation-graph-columns.service'
import {buildTableRelationGraph} from '@/features/workspace/services/table-relation-graph.service'

describe('table-relation-graph-columns.service', () => {
    test('parses comma-separated relation columns', () => {
        assert.deepEqual(parseRelationColumnList('a, b ,c'), ['a', 'b', 'c'])
    })

    test('enriches graph nodes with full column lists and highlights fk columns', () => {
        const relations = {
            tableName: 'orders',
            references: [{
                constraintName: 'fk_user',
                sourceTable: 'orders',
                sourceColumns: 'user_id',
                targetTable: 'users',
                targetColumns: 'id',
            }],
            referencedBy: [],
        }
        const graph = buildTableRelationGraph(relations)
        const columnsByTable = new Map<string, TableColumnDetail[]>([
            ['orders', [
                {ordinal: 1, name: 'id', dataType: 'bigint', nullable: false, autoIncrement: true, keyType: 'PRI'},
                {ordinal: 2, name: 'user_id', dataType: 'bigint', nullable: false, autoIncrement: false},
            ]],
            ['users', [
                {ordinal: 1, name: 'id', dataType: 'bigint', nullable: false, autoIncrement: true, keyType: 'PRI'},
                {ordinal: 2, name: 'name', dataType: 'varchar', nullable: true, autoIncrement: false},
            ]],
        ])

        const enriched = enrichRelationGraphWithColumns(graph, relations, columnsByTable)
        const center = enriched.nodes.find((node) => node.role === 'center')
        const reference = enriched.nodes.find((node) => node.role === 'reference')

        assert.equal(center?.columns.length, 2)
        assert.equal(center?.columns.find((column) => column.name === 'user_id')?.highlighted, true)
        assert.equal(reference?.columns.find((column) => column.name === 'id')?.highlighted, true)
    })

    test('falls back to fk column names when properties are unavailable', () => {
        const relations = {
            tableName: 'orders',
            references: [{
                constraintName: 'fk_user',
                sourceTable: 'orders',
                sourceColumns: 'user_id',
                targetTable: 'users',
                targetColumns: 'id',
            }],
            referencedBy: [],
        }
        const graph = buildTableRelationGraph(relations)
        const center = graph.nodes.find((node) => node.role === 'center')
        assert.ok(center)
        const columns = buildGraphNodeColumns(center, relations, undefined)
        assert.deepEqual(columns.map((column) => column.name), ['user_id'])
    })
})
