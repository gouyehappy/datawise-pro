import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildWhereEqualsClause,
    buildWhereInClause,
} from '@/features/workspace/services/grid-cell-context.service'
import type {TableColumn, TableRow} from '@/core/types'

const statusColumn: TableColumn = {name: 'status', type: 'varchar'}
const idColumn: TableColumn = {name: 'id', type: 'int'}

describe('grid-cell-context.service', () => {
    it('builds equals clause for null', () => {
        assert.equal(buildWhereEqualsClause('status', null), '`status` IS NULL')
    })

    it('builds equals clause for string and number', () => {
        assert.equal(buildWhereEqualsClause('name', "O'Brien"), "`name` = 'O''Brien'")
        assert.equal(buildWhereEqualsClause('id', 42), '`id` = 42')
    })

    it('builds IN clause from distinct page values', () => {
        const rows: TableRow[] = [
            {status: 'ok'},
            {status: 'ok'},
            {status: 'fail'},
        ]
        assert.equal(
            buildWhereInClause('status', rows, statusColumn),
            "`status` IN ('ok', 'fail')",
        )
    })

    it('collapses single-value IN to equals', () => {
        const rows: TableRow[] = [{id: 7}, {id: 7}]
        assert.equal(buildWhereInClause('id', rows, idColumn), '`id` = 7')
    })
})
