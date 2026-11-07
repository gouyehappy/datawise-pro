import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    findKnownTable,
    isCompleteKnownTableRef,
    resolveKnownTableRef,
    tableBaseNameFromRef,
    tableScopeFromRef,
} from '../utils/table-reference.ts'

describe('table-reference', () => {
    const tables = ['test', 'orders', 'orders_archive']

    it('extracts base name from catalog.schema.table', () => {
        assert.equal(tableBaseNameFromRef('hive.a003.test'), 'test')
    })

    it('findKnownTable resolves qualified refs to short name', () => {
        assert.equal(findKnownTable('hive.a003.test', tables), 'test')
        assert.equal(findKnownTable('orders', tables), 'orders')
    })

    it('resolveKnownTableRef normalizes qualified ref to schema short name', () => {
        assert.equal(resolveKnownTableRef('hive.a003.test', tables), 'test')
    })

    it('isCompleteKnownTableRef accepts qualified known table', () => {
        assert.equal(isCompleteKnownTableRef('hive.a003.test', tables), true)
        assert.equal(isCompleteKnownTableRef('hive.a003.', tables), false)
        assert.equal(isCompleteKnownTableRef('orders', tables), true)
        assert.equal(isCompleteKnownTableRef('ord', tables), false)
        assert.equal(isCompleteKnownTableRef('orders_arch', tables), false)
    })

    it('tableScopeFromRef reads catalog.schema', () => {
        assert.equal(tableScopeFromRef('hive.a003.test'), 'hive.a003')
    })
})
