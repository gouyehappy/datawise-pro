import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    displaySchemaTableText,
    filterSchemaTableRows,
    formatSchemaTableCreateTime,
    formatSchemaTableDataLength,
    formatSchemaTableRowCount,
} from '@/features/workspace/services/schema-tables.service'

describe('schema-tables.service', () => {
    it('filters rows by table name, comment, and engine', () => {
        const rows = [
            {tableName: 'orders', rowCount: 10, engine: 'InnoDB', collation: null, dataLength: 1000, createTime: null, comment: '订单'},
            {tableName: 'users', rowCount: 2, engine: 'InnoDB', collation: null, dataLength: 200, createTime: null, comment: '用户'},
        ]
        assert.equal(filterSchemaTableRows(rows, 'order').length, 1)
        assert.equal(filterSchemaTableRows(rows, '用户').length, 1)
    })

    it('formats row count and data length for display', () => {
        assert.equal(formatSchemaTableRowCount(1234), '1,234')
        assert.equal(formatSchemaTableDataLength(2048), '2.0 KB')
        assert.equal(displaySchemaTableText(null), '—')
    })

    it('formats create time for display', () => {
        assert.notEqual(formatSchemaTableCreateTime('2026-06-20T16:16:33.000Z'), '—')
        assert.equal(formatSchemaTableCreateTime(''), '—')
    })
})
