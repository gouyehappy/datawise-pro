import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type * as monaco from 'monaco-editor'
import {
    prefixAfterClauseKeyword,
    completionRange,
    completionPrefix,
    effectiveCompletionInput,
    suggestRangeReplacingTypedPrefix,
} from '../completion/range.ts'
import {filterColumnsForCompletion} from '../completion/schema-column-index.ts'
import {analyzeSqlCompletionContextUncached} from '../completion/context.ts'

function mockModel(line: string, column: number, word = ''): monaco.editor.ITextModel {
    return {
        getLineContent: () => line,
        getWordUntilPosition: () => ({
            word,
            startColumn: word ? column - word.length : column,
            endColumn: column,
        }),
    } as monaco.editor.ITextModel
}

function mockPosition(column: number): monaco.Position {
    return {lineNumber: 1, column} as monaco.Position
}

describe('completion range — clause column prefix', () => {
    it('ON 完整后前缀为空，不会误匹配 description', () => {
        const line = 'SELECT * FROM t1 LEFT JOIN t2 ON'
        assert.equal(prefixAfterClauseKeyword(line, 'ON'), '')
        const cols = [
            {name: 'id'},
            {name: 'description'},
            {name: 'tag_name'},
        ]
        const filtered = filterColumnsForCompletion(cols, '')
        assert.equal(filtered.length, 3)
        const onPrefix = filterColumnsForCompletion(cols, 'on')
        assert.deepEqual(onPrefix.map((c) => c.name), [], 'prefix-only: on does not substring-match description')
        assert.equal(filterColumnsForCompletion(cols, prefixAfterClauseKeyword(line, 'ON')!).length, 3)
    })

    it('ON 后输入列前缀仍有效', () => {
        const line = 'SELECT * FROM t1 LEFT JOIN t2 ON ct.i'
        assert.equal(prefixAfterClauseKeyword(line, 'ON'), 'ct.i')
    })

    it('WHERE 完整后前缀为空', () => {
        assert.equal(prefixAfterClauseKeyword('SELECT * FROM t WHERE', 'WHERE'), '')
    })
})

describe('completion range — keyword replaces full typed prefix', () => {
    it('suggestRangeReplacingTypedPrefix covers wh / ord from cursor', () => {
        assert.deepEqual(
            suggestRangeReplacingTypedPrefix(
                {startLineNumber: 1, endLineNumber: 1, startColumn: 30, endColumn: 30},
                'wh',
            ),
            {startLineNumber: 1, endLineNumber: 1, startColumn: 28, endColumn: 30},
        )
        assert.deepEqual(
            suggestRangeReplacingTypedPrefix(
                {startLineNumber: 1, endLineNumber: 1, startColumn: 28, endColumn: 28},
                'ord',
            ),
            {startLineNumber: 1, endLineNumber: 1, startColumn: 25, endColumn: 28},
        )
    })

    it('FROM table + wh replaces full prefix for WHERE', () => {
        const sql = 'SELECT * FROM flink_job wh'
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, ['flink_job'], {})
        assert.equal(ctx.fromJoin?.tableClauseComplete, true)

        const column = sql.length + 1
        const model = mockModel(sql, column, 'wh')
        const pos = mockPosition(column)
        const {range, prefix} = effectiveCompletionInput(model, pos, ctx)

        assert.equal(prefix, 'wh')
        assert.deepEqual(range, {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: column - 2,
            endColumn: column,
        })
    })

    it('FROM table + ord replaces full prefix for ORDER BY', () => {
        const sql = 'SELECT * FROM flink_job ord'
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, ['flink_job'], {})
        assert.equal(ctx.fromJoin?.tableClauseComplete, true)

        const column = sql.length + 1
        const model = mockModel(sql, column, 'ord')
        const pos = mockPosition(column)
        const {range, prefix} = effectiveCompletionInput(model, pos, ctx)

        assert.equal(prefix, 'ord')
        assert.deepEqual(range, {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: column - 3,
            endColumn: column,
        })
    })

    it('FROM table + alias + whe uses clauseKeywordPrefix range', () => {
        const sql = 'SELECT * FROM flink_job t whe'
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, ['flink_job'], {})
        assert.equal(ctx.fromJoin?.clauseKeywordPrefix, 'whe')

        const column = sql.length + 1
        const model = mockModel(sql, column, 'whe')
        const pos = mockPosition(column)
        const {range, prefix} = effectiveCompletionInput(model, pos, ctx)

        assert.equal(prefix, 'whe')
        assert.deepEqual(range, {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: column - 3,
            endColumn: column,
        })
    })

    it('FROM table complete with trailing space uses cursor insert', () => {
        const sql = 'SELECT * FROM flink_job '
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, ['flink_job'], {})
        assert.equal(ctx.fromJoin?.tableClauseComplete, true)

        const column = sql.length + 1
        const model = mockModel(sql, column, '')
        const pos = mockPosition(column)
        const {range, prefix} = effectiveCompletionInput(model, pos, ctx)

        assert.equal(prefix, '')
        assert.deepEqual(range, {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: column,
            endColumn: column,
        })
    })

    it('SELECT 完整 alias.col 无尾随空格：空前缀 + 光标插入（不替换列名）', () => {
        const sql =
            'SELECT t1.order_id, t3.register_time FROM orders t1 LEFT JOIN users t3 ON t1.user_id = t3.id'
        const offset = sql.indexOf('register_time') + 'register_time'.length
        const ctx = analyzeSqlCompletionContextUncached(sql, offset, ['orders', 'users'], {
            orders: [{name: 'order_id'}, {name: 'user_id'}],
            users: [{name: 'id'}, {name: 'register_time'}],
        })
        assert.equal(ctx.signals.after_complete_column_ref, true)
        assert.equal(ctx.signals.after_select_list_complete_col, true)

        const line = sql.slice(0, offset)
        const column = line.length + 1
        const model = mockModel(line, column, 'register_time')
        const pos = mockPosition(column)
        const {range, prefix} = effectiveCompletionInput(model, pos, ctx)

        assert.equal(prefix, '')
        assert.deepEqual(range, {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: column,
            endColumn: column,
        })
    })
})

describe('completion range — FROM qualified table', () => {
    it('hive. uses cursor insert range and empty prefix', () => {
        const sql = 'SELECT * FROM hive.'
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, [], {})
        const model = mockModel(sql, sql.length + 1)
        const pos = mockPosition(sql.length + 1)
        const range = completionRange(model, pos, ctx)
        assert.deepEqual(range, {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: pos.column,
            endColumn: pos.column,
        })
        assert.equal(completionPrefix(model, pos, ctx), '')
    })

    it('hive.a003.t replaces only table partial', () => {
        const sql = 'SELECT * FROM hive.a003.t'
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, [], {})
        const model = mockModel(sql, sql.length + 1)
        const pos = mockPosition(sql.length + 1)
        const range = completionRange(model, pos, ctx)
        assert.deepEqual(range, {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: pos.column - 1,
            endColumn: pos.column,
        })
        assert.equal(completionPrefix(model, pos, ctx), 't')
    })
})
