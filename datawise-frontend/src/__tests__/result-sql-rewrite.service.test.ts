import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    applyOrderByToSql,
    applyWhereConditionToSql,
    nextOrderDirection,
} from '@/features/workspace/services/result-sql-rewrite.service'

describe('result-sql-rewrite', () => {
    it('appends WHERE when missing', () => {
        assert.equal(
            applyWhereConditionToSql('SELECT * FROM t', '`status` = \'ok\''),
            "SELECT * FROM t\nWHERE `status` = 'ok'",
        )
    })

    it('ANDs when WHERE exists and keeps ORDER BY', () => {
        const sql = 'SELECT * FROM t WHERE id = 1\nORDER BY id'
        assert.equal(
            applyWhereConditionToSql(sql, '`status` = \'ok\''),
            "SELECT * FROM t WHERE id = 1\n  AND `status` = 'ok'\nORDER BY id",
        )
    })

    it('inserts or replaces ORDER BY before LIMIT', () => {
        assert.equal(
            applyOrderByToSql('SELECT * FROM t LIMIT 10', 'name', 'asc'),
            'SELECT * FROM t\nORDER BY `name`\nLIMIT 10',
        )
        assert.equal(
            applyOrderByToSql('SELECT * FROM t\nORDER BY `id`\nLIMIT 10', 'name', 'desc'),
            'SELECT * FROM t\nORDER BY `name` DESC\nLIMIT 10',
        )
    })

    it('toggles order direction on same column', () => {
        assert.equal(nextOrderDirection(null, 'name'), 'asc')
        assert.equal(nextOrderDirection({column: 'name', direction: 'asc'}, 'name'), 'desc')
        assert.equal(nextOrderDirection({column: 'name', direction: 'desc'}, 'name'), 'asc')
        assert.equal(nextOrderDirection({column: 'id', direction: 'asc'}, 'name'), 'asc')
    })
})
