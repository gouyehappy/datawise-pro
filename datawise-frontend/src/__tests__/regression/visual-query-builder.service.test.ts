import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildVisualQuerySql,
    moveSelectedColumnKey,
    parseVisualColumnKey,
    removeSelectedColumnKey,
    suggestTableAlias,
    upsertSelectedColumnKey,
    visualColumnKey,
} from '@/features/workspace/services/visual-query-builder.service'

describe('visual-query-builder.service', () => {
    it('builds select with join where order limit', () => {
        const sql = buildVisualQuerySql({
            fromTable: 'orders',
            fromAlias: 'o',
            joins: [{
                type: 'LEFT',
                table: 'users',
                alias: 'u',
                onLeft: 'o.user_id',
                onRight: 'u.id',
            }],
            columns: [
                {tableAlias: 'o', column: 'id'},
                {tableAlias: 'u', column: 'name'},
            ],
            where: 'o.status = 1',
            orderBy: 'o.id DESC',
            limit: 50,
        })
        assert.match(sql, /SELECT o\.id,\n\s+u\.name/)
        assert.match(sql, /FROM orders o/)
        assert.match(sql, /LEFT JOIN users u ON o\.user_id = u\.id/)
        assert.match(sql, /WHERE o\.status = 1/)
        assert.match(sql, /ORDER BY o\.id DESC/)
        assert.match(sql, /LIMIT 50/)
    })

    it('uses star when no columns selected', () => {
        const sql = buildVisualQuerySql({
            fromTable: 'menus',
            fromAlias: 'm',
            joins: [],
            columns: [],
        })
        assert.equal(sql, 'SELECT *\nFROM menus m;')
    })

    it('builds multiple joins chaining prior aliases', () => {
        const sql = buildVisualQuerySql({
            fromTable: 'orders',
            fromAlias: 'o',
            joins: [
                {
                    type: 'LEFT',
                    table: 'users',
                    alias: 'u',
                    onLeft: 'o.user_id',
                    onRight: 'u.id',
                },
                {
                    type: 'INNER',
                    table: 'order_items',
                    alias: 'oi',
                    onLeft: 'o.id',
                    onRight: 'oi.order_id',
                },
                {
                    type: 'LEFT',
                    table: 'products',
                    alias: 'p',
                    onLeft: 'oi.product_id',
                    onRight: 'p.id',
                },
            ],
            columns: [
                {tableAlias: 'o', column: 'id'},
                {tableAlias: 'u', column: 'name'},
                {tableAlias: 'p', column: 'title'},
            ],
            limit: 20,
        })
        assert.match(sql, /LEFT JOIN users u ON o\.user_id = u\.id/)
        assert.match(sql, /INNER JOIN order_items oi ON o\.id = oi\.order_id/)
        assert.match(sql, /LEFT JOIN products p ON oi\.product_id = p\.id/)
        assert.match(sql, /LIMIT 20/)
    })

    it('suggests unique aliases', () => {
        assert.equal(suggestTableAlias('orders'), 'o')
        assert.equal(suggestTableAlias('orders', ['o']), 'o2')
    })

    it('parses and builds visual column keys', () => {
        assert.equal(visualColumnKey('o', 'id'), 'o.id')
        assert.deepEqual(parseVisualColumnKey('o.id'), {tableAlias: 'o', column: 'id'})
        assert.equal(parseVisualColumnKey('noid'), null)
    })

    it('upserts selected column keys in board order', () => {
        assert.deepEqual(upsertSelectedColumnKey([], 'o.id'), ['o.id'])
        assert.deepEqual(upsertSelectedColumnKey(['o.id', 'u.name'], 'o.status', 1), [
            'o.id',
            'o.status',
            'u.name',
        ])
        assert.deepEqual(upsertSelectedColumnKey(['o.id', 'u.name'], 'o.id', 1), [
            'u.name',
            'o.id',
        ])
    })

    it('moves and removes selected column keys', () => {
        assert.deepEqual(moveSelectedColumnKey(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a'])
        assert.deepEqual(moveSelectedColumnKey(['a', 'b'], 3, 0), ['a', 'b'])
        assert.deepEqual(removeSelectedColumnKey(['o.id', 'u.name'], 'o.id'), ['u.name'])
    })
})
