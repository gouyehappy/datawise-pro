import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TableRelationEdge} from '@/shared/api/types'
import {
    resolveRelatedTableName,
    resolveRelationTableName,
} from '@/features/workspace/services/table-relations.service'

describe('table-relations.actions', () => {
    it('resolves bare table name from qualified identifiers', () => {
        assert.equal(resolveRelationTableName('public.orders'), 'orders')
        assert.equal(resolveRelationTableName('orders'), 'orders')
    })

    it('resolves related table for outgoing and incoming edges', () => {
        const outgoing: TableRelationEdge = {
            constraintName: 'fk_user',
            sourceTable: 'orders',
            sourceColumns: 'user_id',
            targetTable: 'public.users',
            targetColumns: 'id',
        }
        const incoming: TableRelationEdge = {
            constraintName: 'fk_order',
            sourceTable: 'order_items',
            sourceColumns: 'order_id',
            targetTable: 'orders',
            targetColumns: 'id',
        }
        assert.equal(resolveRelatedTableName(outgoing, 'references'), 'users')
        assert.equal(resolveRelatedTableName(incoming, 'referencedBy'), 'order_items')
    })
})
