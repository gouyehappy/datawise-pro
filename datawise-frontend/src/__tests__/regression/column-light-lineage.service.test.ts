import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildColumnLightLineage,
    inferHistoryJoinPeers,
    inferViewColumnSources,
    summarizeLightLineageCounts,
} from '@/features/workspace/services/column-light-lineage.service'

describe('column-light-lineage.service', () => {
    it('marks FK peers as certain upstream/downstream', () => {
        const summary = buildColumnLightLineage({
            tableName: 'orders',
            column: 'user_id',
            foreignKeys: [
                {
                    name: 'fk_orders_user',
                    columns: 'user_id',
                    referenceTable: 'users',
                    referenceColumns: 'id',
                },
            ],
            relations: {
                tableName: 'orders',
                references: [],
                referencedBy: [
                    {
                        constraintName: 'fk_items_order',
                        sourceTable: 'order_items',
                        sourceColumns: 'order_id',
                        targetTable: 'orders',
                        targetColumns: 'id',
                    },
                ],
            },
        })

        assert.equal(summary.upstream.length, 1)
        assert.equal(summary.upstream[0]?.peerTable, 'users')
        assert.equal(summary.upstream[0]?.peerColumn, 'id')
        assert.equal(summary.upstream[0]?.confidence, 'certain')

        const onPk = buildColumnLightLineage({
            tableName: 'orders',
            column: 'id',
            foreignKeys: [],
            relations: {
                tableName: 'orders',
                references: [],
                referencedBy: [
                    {
                        constraintName: 'fk_items_order',
                        sourceTable: 'order_items',
                        sourceColumns: 'order_id',
                        targetTable: 'orders',
                        targetColumns: 'id',
                    },
                ],
            },
        })
        assert.equal(onPk.downstream.length, 1)
        assert.equal(onPk.downstream[0]?.peerTable, 'order_items')
        assert.equal(onPk.downstream[0]?.confidence, 'certain')
    })

    it('infers view sources and history join peers as possible/certain', () => {
        const fromView = inferViewColumnSources(
            'CREATE VIEW v AS SELECT u.id AS user_id, u.name FROM users u',
            'user_id',
        )
        assert.equal(fromView[0]?.peerTable, 'users')
        assert.equal(fromView[0]?.confidence, 'certain')

        const fromHistory = inferHistoryJoinPeers('orders', 'user_id', [
            {
                id: '1',
                sql: 'SELECT * FROM orders o JOIN users u ON o.user_id = u.id',
                time: '',
                duration: '',
                status: 'success',
            },
        ])
        assert.equal(fromHistory.length, 1)
        assert.equal(fromHistory[0]?.peerTable, 'users')
        assert.equal(fromHistory[0]?.confidence, 'possible')

        const summary = buildColumnLightLineage({
            tableName: 'orders',
            column: 'user_id',
            foreignKeys: [],
            viewDdl: 'CREATE VIEW v AS SELECT o.user_id FROM orders o',
            sqlLogs: [
                {
                    id: '1',
                    sql: 'SELECT * FROM orders o JOIN users u ON o.user_id = u.id',
                    time: '',
                    duration: '',
                    status: 'success',
                },
            ],
        })
        const counts = summarizeLightLineageCounts(summary)
        assert.ok(counts.upstream >= 1)
        assert.ok(counts.possible >= 1)
    })
})
