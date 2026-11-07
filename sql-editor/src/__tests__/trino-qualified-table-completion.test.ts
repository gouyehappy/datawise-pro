import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {parseTableAliases} from '../utils/parse-references.ts'
import {analyzeSqlCompletionContextUncached, tablesReferencedInQuery} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {resolveCompletionKeywords} from '../completion/plan-keywords.ts'
import {setActiveSqlEditorRuntime, createSqlEditorRuntime} from '../runtime/sql-editor-runtime.ts'
import {toPlainSqlEditorSchema} from '../utils/schema-plain.ts'
import {collectAliasComplete, collectAliasDotStar, collectColumnSuggestions, collectStarExpansion} from '../completion/builders/column-collectors.ts'
import type {SqlEditorSchema} from '../types.ts'

describe('trino qualified table completion', () => {
    const tables = ['test']
    const columns = {
        test: [{name: 'id'}, {name: 'name'}, {name: 'created_at'}],
    }
    const schema: SqlEditorSchema = {tables, columns}

    it('parseTableAliases maps alias to short table name', () => {
        const aliases = parseTableAliases(
            'SELECT * FROM hive.a003.test t WHERE t.id = 1',
            tables,
        )
        assert.equal(aliases.t, 'test')
        assert.equal(aliases.test, 'test')
    })

    it('after table+alias suggests WHERE', () => {
        const sql = 'SELECT * FROM hive.a003.test t '
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, tables, columns)
        const plan = resolveCompletionPlan(ctx)
        const keywords = resolveCompletionKeywords(ctx, plan)
        assert.ok(keywords.some((kw) => kw.toUpperCase() === 'WHERE'))
        assert.equal(ctx.fromJoin?.tableClauseComplete, true)
    })

    it('alias dot resolves table and suggests columns via runtime schema', () => {
        const runtime = createSqlEditorRuntime({sync: false})
        runtime.setSchema(toPlainSqlEditorSchema(schema))
        setActiveSqlEditorRuntime(runtime, {sync: false})

        const sql = 'SELECT * FROM hive.a003.test t WHERE t.'
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, tables, columns)
        assert.equal(ctx.slot, 'column_ref')
        assert.equal(ctx.qualifier, 't')
        assert.equal(ctx.resolvedTable, 'test')

        const items: Array<{ insertText: string }> = []
        collectColumnSuggestions(
            ctx,
            (item) => items.push(item),
            {startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1},
            '',
            true,
        )
        assert.deepEqual(items.map((item) => item.insertText).sort(), ['created_at', 'id', 'name'])
    })

    it('WHERE slot keeps alias mapping for column loading', () => {
        const sql = 'SELECT * FROM hive.a003.test t WHERE '
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, tables, columns)
        assert.equal(ctx.slot, 'where')
        assert.equal(ctx.aliases.t, 'test')
        assert.deepEqual(tablesReferencedInQuery(ctx), ['test'])
    })

    it('AS 后优先建议当前列名作为别名，不再回落字段列表', () => {
        const runtime = createSqlEditorRuntime({sync: false})
        runtime.setSchema(toPlainSqlEditorSchema(schema))
        setActiveSqlEditorRuntime(runtime, {sync: false})

        const sql = 'SELECT t.product_name AS pro FROM hive.a003.test t'
        const offset = sql.indexOf(' FROM')
        const ctx = analyzeSqlCompletionContextUncached(sql, offset, tables, {
            test: [{name: 'product_name'}, {name: 'id'}],
        })

        const aliasItems: Array<{ insertText: string }> = []
        collectAliasComplete(
            ctx,
            (item) => aliasItems.push(item),
            {startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1},
            'pro',
            true,
        )
        assert.deepEqual(aliasItems.map((item) => item.insertText), ['product_name'])

        const columnItems: Array<{ insertText: string }> = []
        collectColumnSuggestions(
            ctx,
            (item) => columnItems.push(item),
            {startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1},
            'pro',
            true,
        )
        assert.deepEqual(columnItems, [])
    })

    it('SELECT 列表 t1. 后锁定该表字段（不再夹杂 Expand / t1.*）', () => {
        const runtime = createSqlEditorRuntime({sync: false})
        const orderSchema: SqlEditorSchema = {
            tables: ['order_detail'],
            columns: {
                order_detail: [
                    {name: 'product_name'},
                    {name: 'price'},
                    {name: 'order_id'},
                    {name: 'product_id'},
                ],
            },
        }
        runtime.setSchema(toPlainSqlEditorSchema(orderSchema))
        setActiveSqlEditorRuntime(runtime, {sync: false})

        const sql = `SELECT t1.product_name AS product_name, t1.price AS price, t1.
FROM aaflinktest.order_detail t1
WHERE t1.order_id = 'ORD001';`
        const offset = sql.indexOf(', t1.') + ', t1.'.length
        const ctx = analyzeSqlCompletionContextUncached(
            sql,
            offset,
            orderSchema.tables,
            orderSchema.columns,
        )
        assert.equal(ctx.qualifier, 't1')
        assert.equal(ctx.aliases.t1, 'order_detail')

        const range = {startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1}

        // 即使误判为 select_list + 前缀 t1，也应列出字段
        const wrongSlotCtx = {...ctx, slot: 'select_list' as const}
        const columnItems: Array<{ insertText: string }> = []
        collectColumnSuggestions(wrongSlotCtx, (item) => columnItems.push(item), range, 't1', true)
        assert.deepEqual(
            columnItems.map((item) => item.insertText).sort(),
            ['order_id', 'price', 'product_id', 'product_name'],
        )

        const starItems: Array<{ insertText: string }> = []
        collectStarExpansion(ctx, (item) => starItems.push(item), range, '', true)
        assert.deepEqual(starItems, [], '纯 t1. 不应再提示 Expand / t1.*')
    })

    it('裸前缀 t1 不触发 Expand，应由 aliasComplete 插入 t1.', () => {
        const runtime = createSqlEditorRuntime({sync: false})
        const orderSchema: SqlEditorSchema = {
            tables: ['order_detail'],
            columns: {
                order_detail: [{name: 'order_id'}, {name: 'product_id'}],
            },
        }
        runtime.setSchema(toPlainSqlEditorSchema(orderSchema))
        setActiveSqlEditorRuntime(runtime, {sync: false})

        const sql = `SELECT t1.order_id AS order_id, t1
FROM aaflinktest.order_detail t1`
        const offset = sql.indexOf(', t1') + ', t1'.length
        const ctx = analyzeSqlCompletionContextUncached(
            sql,
            offset,
            orderSchema.tables,
            orderSchema.columns,
        )
        assert.equal(ctx.slot, 'select_list')

        const range = {startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1}

        const starItems: Array<{ insertText: string }> = []
        collectAliasDotStar(ctx, (item) => starItems.push(item), range, 't1', true)
        assert.deepEqual(starItems, [])

        const aliasItems: Array<{ insertText: string }> = []
        collectAliasComplete(ctx, (item) => aliasItems.push(item), range, 't1', true)
        assert.ok(aliasItems.some((item) => item.insertText === 't1.'))
    })

    it('schema 列键为限定名时仍能按短表名解析列', () => {
        const runtime = createSqlEditorRuntime({sync: false})
        const qualifiedSchema: SqlEditorSchema = {
            tables: ['order_detail'],
            columns: {
                'aaflinktest.order_detail': [{name: 'product_name'}, {name: 'order_id'}],
            },
        }
        runtime.setSchema(toPlainSqlEditorSchema(qualifiedSchema))
        setActiveSqlEditorRuntime(runtime, {sync: false})

        const sql = 'SELECT t1. FROM aaflinktest.order_detail t1'
        const offset = sql.indexOf(' FROM')
        const ctx = analyzeSqlCompletionContextUncached(
            sql,
            offset,
            qualifiedSchema.tables,
            qualifiedSchema.columns,
        )
        assert.equal(ctx.slot, 'column_ref')
        assert.equal(ctx.resolvedTable, 'order_detail')

        const items: Array<{ insertText: string }> = []
        collectColumnSuggestions(
            ctx,
            (item) => items.push(item),
            {startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1},
            '',
            true,
        )
        assert.deepEqual(items.map((item) => item.insertText).sort(), ['order_id', 'product_name'])
    })
})
