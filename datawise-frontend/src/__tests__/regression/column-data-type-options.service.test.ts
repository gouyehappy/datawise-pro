import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    applySelectedColumnDataType,
    composeColumnDataType,
    filterColumnDataTypeSuggestions,
    listColumnDataTypeSuggestions,
    parseColumnDataType,
    typeSupportsLength,
    typeSupportsScale,
} from '@/features/workspace/services/column-data-type-options.service'

describe('column-data-type-options.service', () => {
    it('lists dbeaver-style base types for mysql', () => {
        const types = listColumnDataTypeSuggestions('mysql')
        assert.ok(types.includes('varchar'))
        assert.ok(types.includes('datetime'))
        assert.equal(types.includes('varchar(255)'), false)
    })

    it('parses and composes length / scale like dbeaver columns', () => {
        assert.deepEqual(parseColumnDataType('varchar(32)'), {
            baseType: 'varchar',
            length: '32',
            scale: null,
        })
        assert.deepEqual(parseColumnDataType('decimal(10,2)'), {
            baseType: 'decimal',
            length: '10',
            scale: '2',
        })
        assert.deepEqual(parseColumnDataType('datetime(3)'), {
            baseType: 'datetime',
            length: '3',
            scale: null,
        })
        assert.equal(composeColumnDataType('VARCHAR', '64', null), 'VARCHAR(64)')
        assert.equal(composeColumnDataType('DECIMAL', '18', '4'), 'DECIMAL(18,4)')
        assert.equal(composeColumnDataType('DATETIME', '3', null), 'DATETIME(3)')
        assert.equal(typeSupportsLength('VARCHAR'), true)
        assert.equal(typeSupportsScale('DECIMAL'), true)
        assert.equal(typeSupportsScale('DATETIME'), false)
    })

    it('preserves length when switching base types', () => {
        assert.equal(applySelectedColumnDataType('varchar(32)', 'CHAR'), 'CHAR(32)')
        assert.equal(applySelectedColumnDataType('datetime(3)', 'TIMESTAMP'), 'TIMESTAMP(3)')
        assert.equal(applySelectedColumnDataType('int', 'VARCHAR'), 'VARCHAR(255)')
    })

    it('filters base types by query', () => {
        const filtered = filterColumnDataTypeSuggestions('mysql', 'date', 'datetime(3)')
        assert.ok(filtered.some((item) => /date/i.test(item)))
    })
})
