import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildWhereFromFilterRules,
    countActiveFilterBuilderRules,
    createFilterBuilderRule,
    formatFilterLiteral,
} from '@/core/data-grid/services/grid-filter-builder.service'

describe('grid-filter-builder.service', () => {
    it('formats literals', () => {
        assert.equal(formatFilterLiteral('12'), '12')
        assert.equal(formatFilterLiteral("o'brien"), "'o''brien'")
        assert.equal(formatFilterLiteral('NULL'), 'NULL')
        assert.equal(formatFilterLiteral('true'), 'TRUE')
    })

    it('builds AND where from complete rules', () => {
        const rules = [
            createFilterBuilderRule({column: 'id', operator: 'eq', value: '1'}),
            createFilterBuilderRule({
                column: 'name',
                operator: 'contains',
                value: 'ab',
                conjunction: 'AND',
            }),
        ]
        assert.equal(countActiveFilterBuilderRules(rules), 2)
        assert.equal(buildWhereFromFilterRules(rules), "(id = 1) AND (name LIKE '%ab%')")
    })

    it('supports IS NULL without value', () => {
        const rules = [
            createFilterBuilderRule({column: 'description', operator: 'isNull', value: ''}),
        ]
        assert.equal(buildWhereFromFilterRules(rules), 'description IS NULL')
    })

    it('ignores incomplete rules', () => {
        const rules = [
            createFilterBuilderRule({column: '', operator: 'eq', value: 'x'}),
            createFilterBuilderRule({column: 'id', operator: 'eq', value: ''}),
        ]
        assert.equal(buildWhereFromFilterRules(rules), '')
        assert.equal(countActiveFilterBuilderRules(rules), 0)
    })
})
