import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    formatOrderClause,
    parseOrderClause,
    suggestClauseColumns,
} from '@/features/workspace/services/grid-clause-bar.service'
import {
    compileWhereExpression,
    rowMatchesWhereExpression,
} from '@/features/workspace/services/grid-where-expression.service'

describe('grid-clause-bar.service', () => {
    it('parses order by with optional direction', () => {
        assert.deepEqual(parseOrderClause('create_date'), {column: 'create_date', direction: 'asc'})
        assert.deepEqual(parseOrderClause('name DESC'), {column: 'name', direction: 'desc'})
        assert.equal(parseOrderClause(''), null)
    })

    it('formats order clause', () => {
        assert.equal(formatOrderClause('name', 'asc'), 'name')
        assert.equal(formatOrderClause('name', 'desc'), 'name DESC')
    })

    it('suggests columns for where identifier prefixes only', () => {
        const columns = [
            {name: 'id', type: 'VARCHAR'},
            {name: 'name', type: 'VARCHAR'},
            {name: 'status', type: 'BIT'},
        ]
        assert.deepEqual(suggestClauseColumns(columns, '', 0, 'where').suggestions, [])
        assert.deepEqual(suggestClauseColumns(columns, 'na', 2, 'where').suggestions, [
            {name: 'name', type: 'VARCHAR'},
        ])
        assert.deepEqual(suggestClauseColumns(columns, "name LIKE '%x'", 12, 'where').suggestions, [])
        assert.deepEqual(suggestClauseColumns(columns, 'st', 2, 'order').suggestions, [
            {name: 'status', type: 'BIT'},
        ])
    })
})

describe('grid-where-expression.service', () => {
    const row = (values: Record<string, unknown>) => (column: string) => {
        const key = Object.keys(values).find((name) => name.toLowerCase() === column.toLowerCase())
        return key == null ? undefined : values[key]
    }

    it('supports equals and like', () => {
        assert.equal(compileWhereExpression('name like "%test%"').ok, true)
        assert.equal(rowMatchesWhereExpression('name like "%test%"', row({name: 'test_john'})), true)
        assert.equal(rowMatchesWhereExpression("name LIKE '%bug%'", row({name: 'ssss'})), false)
        assert.equal(rowMatchesWhereExpression("status = '1'", row({status: 1})), true)
    })

    it('tolerates LIKE = typo from field=value muscle memory', () => {
        assert.equal(compileWhereExpression("name like = '%test%'").ok, true)
        assert.equal(rowMatchesWhereExpression("name like = '%test%'", row({name: 'test_john_0312_1'})), true)
        assert.equal(rowMatchesWhereExpression("name like = '%test%'", row({name: 'ssss'})), false)
        assert.equal(rowMatchesWhereExpression("name like = '%test%'", row({name: 'bug'})), false)
        assert.equal(rowMatchesWhereExpression("name ILIKE = '%TEST%'", row({name: 'test 0314'})), true)
    })

    it('supports and / or / not / in / is null', () => {
        assert.equal(
            rowMatchesWhereExpression(
                "name LIKE '%test%' AND del_flag = 0",
                row({name: 'test_a', del_flag: 0}),
            ),
            true,
        )
        assert.equal(
            rowMatchesWhereExpression(
                "status IN ('active', 'open')",
                row({status: 'open'}),
            ),
            true,
        )
        assert.equal(rowMatchesWhereExpression('remark IS NULL', row({remark: null})), true)
        assert.equal(rowMatchesWhereExpression("NOT name = 'bug'", row({name: 'ok'})), true)
    })

    it('rejects invalid fragments', () => {
        assert.equal(compileWhereExpression('name like').ok, false)
        assert.equal(compileWhereExpression('name === 1').ok, false)
    })
})
