import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {SchemaCompareResult, TableSchemaDiff} from '@/features/schema-compare/types/schema-compare.types'
import {
    applySchemaCompareSelection,
    buildDefaultColumnSelection,
    buildDefaultTableSelection,
    buildSelectedSchemaMigrateDdl,
    listConflictTableDiffs,
} from '@/features/schema-compare/services/schema-compare-selection.service'

const tableDiffs: TableSchemaDiff[] = [
    {tableName: 'users', status: 'unchanged', columnDiffs: []},
    {
        tableName: 'orders',
        status: 'added',
        columnDiffs: [],
    },
    {
        tableName: 'items',
        status: 'changed',
        columnDiffs: [
            {name: 'qty', status: 'modified', left: undefined, right: undefined, changes: ['dataType']},
            {name: 'note', status: 'added', left: undefined, changes: ['missing_on_right']},
        ],
    },
]

describe('schema-compare-selection.service', () => {
    it('lists only conflict tables', () => {
        assert.equal(listConflictTableDiffs(tableDiffs).length, 2)
    })

    it('defaults to all conflict tables and columns', () => {
        const tables = buildDefaultTableSelection(tableDiffs)
        assert.deepEqual([...tables], ['orders', 'items'])
        assert.deepEqual([...buildDefaultColumnSelection(tableDiffs[2]!)], ['qty', 'note'])
    })

    it('filters selected tables and columns for export', () => {
        const selected = applySchemaCompareSelection(
            tableDiffs,
            new Set(['items']),
            new Map([['items', new Set(['qty'])]]),
        )
        assert.equal(selected.length, 1)
        assert.equal(selected[0]?.tableName, 'items')
        assert.deepEqual(selected[0]?.columnDiffs.map((column) => column.name), ['qty'])
    })

    it('builds ddl only for selected changes', () => {
        const result: SchemaCompareResult = {
            tableDiffs,
            ddl: '',
            summary: {added: 1, removed: 0, changed: 1, unchanged: 1},
            createDdls: {orders: 'CREATE TABLE orders (id INT);'},
        }
        const ddl = buildSelectedSchemaMigrateDdl(
            result,
            'mysql',
            'shop',
            new Set(['orders']),
            new Map(),
        )
        assert.match(ddl, /CREATE TABLE orders/)
        assert.doesNotMatch(ddl, /ALTER TABLE items/)
    })
})
