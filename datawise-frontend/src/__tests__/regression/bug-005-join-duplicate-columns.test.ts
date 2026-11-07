import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {columnRowKey, readRowCell} from '../../core/utils/query-result-column.ts'

describe('BUG-005: JOIN duplicate column names use unique row keys', () => {
    it('reads cells by column.key when present', () => {
        const col = {name: 'id', key: 'c1', type: 'BIGINT'}
        const row = {c1: 2, c3: 99}
        assert.equal(readRowCell(row, col), 2)
    })

    it('falls back to column.name for legacy rows', () => {
        const col = {name: 'tag_name', type: 'VARCHAR'}
        const row = {tag_name: '高价值用户'}
        assert.equal(readRowCell(row, col), '高价值用户')
    })

    it('does not confuse two columns with the same display name', () => {
        const left = {name: 'id', key: 'c1'}
        const right = {name: 'cdp_segment.id', key: 'c3'}
        const row = {c1: 2, c3: null}
        assert.equal(readRowCell(row, left), 2)
        assert.equal(readRowCell(row, right), null)
        assert.notEqual(columnRowKey(left), columnRowKey(right))
    })
})
