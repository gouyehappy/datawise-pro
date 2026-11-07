import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildOrderByFillInsert,
    buildWhereFillInsert,
} from '@/features/workspace/services/result-sql-fill.service'
import {buildOrderByClause} from '@/features/workspace/services/grid-cell-context.service'

describe('result-sql-fill', () => {
    it('builds ORDER BY with optional leading newline', () => {
        assert.equal(buildOrderByClause('name'), 'ORDER BY `name`')
        assert.equal(buildOrderByClause('name', 'desc'), 'ORDER BY `name` DESC')
        assert.equal(buildOrderByFillInsert('name'), '\nORDER BY `name`')
        assert.equal(buildOrderByFillInsert('name', 'desc'), '\nORDER BY `name` DESC')
    })

    it('uses WHERE or AND based on statement', () => {
        assert.equal(
            buildWhereFillInsert('SELECT * FROM t', 'status', 'ok'),
            "\nWHERE `status` = 'ok'",
        )
        assert.equal(
            buildWhereFillInsert('SELECT * FROM t WHERE id = 1', 'status', 'ok'),
            "\n  AND `status` = 'ok'",
        )
        assert.equal(
            buildWhereFillInsert('SELECT * FROM t WHERE id = 1', 'status', null),
            '\n  AND `status` IS NULL',
        )
    })
})
