import assert from 'node:assert/strict'
import test from 'node:test'
import {sqlStatementFoldingRanges} from '@sql-editor/utils/sql-folding-ranges'

test('sqlStatementFoldingRanges: one range per multi-line statement', () => {
    const sql = [
        'SELECT',
        '  *',
        'FROM t',
        'WHERE id = 1;',
        '',
        'SELECT 1;',
        '',
        'SELECT',
        '  a',
        'FROM b;',
    ].join('\n')

    const ranges = sqlStatementFoldingRanges(sql)
    assert.equal(ranges.length, 2)
    assert.deepEqual(ranges, [
        {start: 1, end: 4},
        {start: 8, end: 10},
    ])
})

test('sqlStatementFoldingRanges: single-line statements are not foldable', () => {
    const ranges = sqlStatementFoldingRanges('SELECT 1; SELECT 2;')
    assert.equal(ranges.length, 0)
})

test('sqlStatementFoldingRanges: ignores semicolon inside string', () => {
    const sql = [
        "SELECT 'a;b'",
        'FROM t;',
    ].join('\n')
    const ranges = sqlStatementFoldingRanges(sql)
    assert.equal(ranges.length, 1)
    assert.deepEqual(ranges[0], {start: 1, end: 2})
})
