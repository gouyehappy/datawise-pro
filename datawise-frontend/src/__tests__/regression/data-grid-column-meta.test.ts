import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TableColumn} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import {
    isGridColumnPrimaryKey,
    isGridNumericColumn,
    resolveGridColumnTypeLabel,
} from '@/core/components/data-grid-column-meta'

describe('data-grid-column-meta', () => {
    const col = (name: string, type?: string): TableColumn => ({name, type})

    it('prefers columnDetails.dataType for type label', () => {
        const details: TableColumnDetail[] = [{
            ordinal: 1,
            name: 'price',
            dataType: 'DECIMAL(10,2)',
            nullable: false,
            autoIncrement: false,
        }]
        assert.equal(resolveGridColumnTypeLabel(col('price', 'DOUBLE'), details), 'DECIMAL(10,2)')
        assert.equal(resolveGridColumnTypeLabel(col('price', 'DOUBLE'), []), 'DOUBLE')
    })

    it('detects primary key from pkColumns or keyType', () => {
        assert.equal(isGridColumnPrimaryKey(col('id'), ['id'], []), true)
        assert.equal(isGridColumnPrimaryKey(col('id'), [], [{
            ordinal: 1,
            name: 'id',
            dataType: 'INT',
            nullable: false,
            autoIncrement: true,
            keyType: 'PRI',
        }]), true)
        assert.equal(isGridColumnPrimaryKey(col('name'), [], []), false)
    })

    it('detects numeric types for right alignment', () => {
        assert.equal(isGridNumericColumn(col('n', 'INT')), true)
        assert.equal(isGridNumericColumn(col('n', 'DECIMAL(10,2)')), true)
        assert.equal(isGridNumericColumn(col('n', 'VARCHAR(32)')), false)
        assert.equal(isGridNumericColumn(col('n', 'DATETIME(3)')), false)
    })
})
