import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {classifyColumnType} from '../completion/column-type.ts'
import {buildPredicateValueItems} from '../completion/predicate-value-templates.ts'

describe('predicate value templates by column type', () => {
    it('int column → numeric placeholder only', () => {
        assert.equal(classifyColumnType('int'), 'numeric')
        const items = buildPredicateValueItems('equals', 'numeric', [], {type: 'int'})
        assert.deepEqual(
            items.map((i) => i.label),
            ['123'],
        )
    })

    it('varchar column → string placeholder + empty string', () => {
        assert.equal(classifyColumnType('varchar(64)'), 'string')
        const items = buildPredicateValueItems('equals', 'string', [], {type: 'varchar(64)'})
        assert.deepEqual(
            items.map((i) => i.label),
            ['abc', "''"],
        )
    })

    it('boolean column → TRUE / FALSE', () => {
        const items = buildPredicateValueItems('equals', 'boolean', [], {type: 'tinyint(1)'})
        assert.deepEqual(
            items.map((i) => i.label),
            ['TRUE', 'FALSE'],
        )
    })

    it('date column → date literal + CURRENT_DATE + NOW()', () => {
        const items = buildPredicateValueItems('equals', 'temporal', [], {type: 'date'})
        assert.deepEqual(
            items.map((i) => i.label),
            ['YYYY-MM-DD', 'CURRENT_DATE', 'NOW()'],
        )
    })

    it('datetime column → datetime literal + CURRENT_TIMESTAMP + NOW()', () => {
        const items = buildPredicateValueItems('equals', 'temporal', [], {type: 'datetime'})
        assert.deepEqual(
            items.map((i) => i.label),
            ['YYYY-MM-DD HH:MM:SS', 'CURRENT_TIMESTAMP', 'NOW()'],
        )
    })

    it('unknown type → both numeric and string placeholders', () => {
        const items = buildPredicateValueItems('equals', 'unknown', [], {})
        assert.deepEqual(
            items.map((i) => i.label),
            ['123', 'abc'],
        )
    })
})
