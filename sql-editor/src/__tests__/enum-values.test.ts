import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {buildEnumInListLiteral, formatSqlEnumLiteral} from '../completion/enum-values.ts'
import {columnEnumValues} from '../utils/schema-columns.ts'
import type {SqlColumnMeta} from '../types.ts'

describe('enum value literals', () => {
    it('quotes string enum values', () => {
        assert.equal(formatSqlEnumLiteral('active', {name: 'status', type: 'varchar'}), "'active'")
    })

    it('keeps numeric enum values unquoted', () => {
        assert.equal(formatSqlEnumLiteral('1', {name: 'level', type: 'int'}), '1')
    })

    it('builds IN list from enums', () => {
        const meta: SqlColumnMeta = {name: 'status', type: 'varchar', enumValues: ['on', 'off']}
        assert.equal(buildEnumInListLiteral(columnEnumValues(meta), meta), "'on', 'off'")
    })
})
