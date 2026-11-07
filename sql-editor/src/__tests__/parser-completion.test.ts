import {describe, it, beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {resolveSnapshotPlan} from '../completion/parser/resolve-snapshot.ts'
import {caretFromOffset} from '../completion/parser/caret.ts'
import {getSqlParser, resetSqlParserCache} from '../sql-parser/index.ts'
import {resetCompletionSqlParserHold} from '../completion/parser/parser-hold.ts'
import {buildSnapshot} from '../completion/core/snapshot.ts'
import {collectKeywordSuggestions} from '../completion/builders/keyword-snippet-collectors.ts'
import {resolveCompletionKeywords} from '../completion/plan-keywords.ts'

const TABLES = ['orders', 'users', 'cdp_tag']
const COLUMNS = {
    orders: [{name: 'id', type: 'bigint'}, {name: 'status', type: 'varchar'}],
    users: [{name: 'id'}],
    cdp_tag: [{name: 'id'}],
}

describe('completion/parser-keywords', () => {
    beforeEach(() => {
        resetSqlParserCache()
        resetCompletionSqlParserHold()
    })

    it('resolveCompletionPlan：stage 来自 grammar，关键字来自配置', () => {
        const sql = 'SELECT * FROM orders t1 '
        const ctx = analyzeSqlCompletionContext(sql, sql.length, TABLES, COLUMNS)
        const plan = resolveCompletionPlan(ctx, {
            parserKeywords: ['WHERE', 'LEFT', 'INNER', 'JOIN'],
        })
        assert.equal(plan.stage, 'table.clause_next')
        assert.ok(plan.parserKeywords?.includes('WHERE'))
        assert.equal(plan.collectors.includes('columns'), false)
    })

    it('resolveCompletionPlan：= 空格后 stage 为 pick_value', () => {
        const sql = 'SELECT * FROM orders ord WHERE ord.id = '
        const ctx = analyzeSqlCompletionContext(sql, sql.length, TABLES, COLUMNS)
        const plan = resolveCompletionPlan(ctx)
        assert.equal(plan.stage, 'predicate.pick_value')
        assert.deepEqual(plan.collectors, ['aliasComplete', 'columns', 'predicateValues'])
    })

    it('resolveCompletionPlan：值后 stage 为 after_where_complete', () => {
        const sql =
            'SELECT * FROM orders ord LEFT JOIN users us ON ord.user_id = us.id WHERE ord.id = 123 '
        const ctx = analyzeSqlCompletionContext(sql, sql.length, TABLES, COLUMNS)
        const plan = resolveCompletionPlan(ctx, {
            parserKeywords: ['AND', 'OR', 'GROUP'],
        })
        assert.equal(plan.stage, 'predicate.after_where_complete')
        assert.equal(plan.keywordSlot, 'after_where')
        assert.ok(plan.collectors.includes('keywords'))
        assert.equal(plan.collectors.includes('columns'), false)
    })

    it('resolveCompletionPlan：FROM 后 stage 为 table.pick', () => {
        const sql = 'SELECT * FROM '
        const ctx = analyzeSqlCompletionContext(sql, sql.length, TABLES, COLUMNS)
        const plan = resolveCompletionPlan(ctx)
        assert.equal(plan.stage, 'table.pick')
        assert.ok(plan.collectors.includes('tables'))
    })

    it('resolveCompletionKeywords：clause-next 过滤 charset / index hint', () => {
        const sql = 'SELECT * FROM users us '
        const ctx = analyzeSqlCompletionContext(sql, sql.length, TABLES, COLUMNS)
        const plan = resolveCompletionPlan(ctx, {
            parserKeywords: ['FORCE', 'IGNORE', 'BINARY', 'ARMSCII8', 'ASCII', 'WHERE', 'LEFT JOIN'],
        })
        const keywords = resolveCompletionKeywords(ctx, plan)
        assert.ok(keywords.includes('WHERE'))
        assert.ok(keywords.includes('LEFT JOIN'))
        assert.equal(keywords.includes('FORCE'), false)
        assert.equal(keywords.includes('ARMSCII8'), false)
        assert.equal(keywords.includes('BINARY'), false)
    })

    it('buildSnapshot：SELECT 列表输入 fro 提示 FROM', () => {
        const sql = 'SELECT * fro'
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
        const snapshot = buildSnapshot(sql, offset, ctx, {parser: null})
        assert.equal(snapshot.plan.keywordPhase, 'clause-prefix')

        const items: { label: unknown }[] = []
        collectKeywordSuggestions(
            ctx,
            (item) => items.push(item),
            {
                lineAtRange: sql,
                fullSql: sql,
                cursorOffset: offset,
                lineBeforeCursor: sql,
            },
            {startLineNumber: 1, startColumn: offset - 2, endLineNumber: 1, endColumn: offset + 1},
            'fro',
            snapshot.plan,
        )
        const labelText = (label: unknown) =>
            typeof label === 'string' ? label : (label as { label?: string })?.label ?? ''
        const labels = items.map((i) => labelText(i.label).toUpperCase())
        assert.ok(labels.includes('FROM'), `labels: ${labels.join(', ')}`)
    })

    it('buildSnapshot：SELECT 列表不提示 parser 词法关键字', async () => {
        const parser = await getSqlParser('mysql')
        const sql = 'SELECT t1.tag_name, t FROM cdp_tag t1'
        const offset = sql.indexOf(', t') + 2
        const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
        const snapshot = buildSnapshot(sql, offset, ctx, {parser})
        assert.equal(snapshot.plan.keywordPhase, 'clause-prefix')
        assert.equal(snapshot.plan.collectors.includes('keywords'), true)

        const items: { label: unknown; kind?: number }[] = []
        collectKeywordSuggestions(
            ctx,
            (item) => items.push(item),
            {
                lineAtRange: '',
                fullSql: sql,
                cursorOffset: offset,
                lineBeforeCursor: sql.slice(0, offset),
            },
            {startLineNumber: 1, startColumn: offset, endLineNumber: 1, endColumn: offset + 1},
            't',
            snapshot.plan,
        )
        const labelText = (label: unknown) =>
            typeof label === 'string' ? label : (label as { label?: string })?.label ?? ''
        const labels = items.map((i) => labelText(i.label).toUpperCase())
        const noise = ['TOKUDB', 'TABLES', 'TIME', 'TIMESTAMP', 'TEXT', 'TRIM', 'TRUE']
        for (const word of noise) {
            assert.equal(labels.includes(word), false, `unexpected keyword ${word}`)
        }
    })

    it('buildSnapshot + MySQL parser：SELECT 列表不提示 charset 代码页', async () => {
        const parser = await getSqlParser('mysql')
        const sql = "SELECT ct.tag_name, ct.tag_code, c FROM cdp_tag ct WHERE ct.tag_name = 'test'"
        const offset = sql.indexOf(', c') + 2
        const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
        const snapshot = buildSnapshot(sql, offset, ctx, {parser})
        const keywords = resolveCompletionKeywords(ctx, snapshot.plan)
        assert.equal(keywords.some((k) => /^CP\d+$/i.test(k)), false)
        assert.equal(keywords.includes('CP1250'), false)

        const items: { label: unknown }[] = []
        collectKeywordSuggestions(
            ctx,
            (item) => items.push(item),
            {
                lineAtRange: '',
                fullSql: sql,
                cursorOffset: offset,
                lineBeforeCursor: sql.slice(0, offset),
            },
            {startLineNumber: 1, startColumn: offset, endLineNumber: 1, endColumn: offset + 1},
            'c',
            snapshot.plan,
        )
        const labelText = (label: unknown) =>
            typeof label === 'string' ? label : (label as { label?: string })?.label ?? ''
        const labels = items.map((i) => labelText(i.label).toUpperCase())
        assert.equal(labels.some((l) => /^CP\d+$/.test(l)), false)
    })

    it('buildSnapshot：表+别名后提示配置子句关键字', async () => {
        const sql = 'SELECT * FROM users us '
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
        const snapshot = buildSnapshot(sql, offset, ctx, {parser: null})
        assert.equal(snapshot.plan.stage, 'table.clause_next')
        assert.ok(snapshot.plan.parserKeywords?.includes('WHERE'))

        const items: { label: unknown }[] = []
        collectKeywordSuggestions(
            ctx,
            (item) => items.push(item),
            {
                lineAtRange: '',
                fullSql: sql,
                cursorOffset: offset,
                lineBeforeCursor: sql.slice(0, offset),
            },
            {startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1},
            '',
            snapshot.plan,
        )
        const labelText = (label: unknown) =>
            typeof label === 'string' ? label : (label as { label?: string })?.label ?? ''
        const labels = items.map((i) => labelText(i.label).toUpperCase())
        assert.ok(labels.some((l) => l.includes('WHERE') || l.includes('JOIN')))
    })

    it('buildSnapshot：关键字经 keywordPhase 过滤', async () => {
        const sql = 'SELECT * FROM cdp_tag ct whe'
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
        const snapshot = buildSnapshot(sql, offset, ctx, {parser: null})
        assert.ok(snapshot.plan.parserKeywords?.length)
        assert.equal(snapshot.plan.stage, 'table.clause_next')

        const items: { label: unknown }[] = []
        collectKeywordSuggestions(
            ctx,
            (item) => items.push(item),
            {
                lineAtRange: '',
                fullSql: sql,
                cursorOffset: offset,
                lineBeforeCursor: sql.slice(0, offset),
            },
            {startLineNumber: 1, startColumn: 22, endLineNumber: 1, endColumn: 29},
            'whe',
            snapshot.plan,
        )
        const labelText = (label: unknown) =>
            typeof label === 'string' ? label : (label as { label?: string })?.label ?? ''
        const labels = items.map((i) => labelText(i.label))
        assert.ok(labels.some((l) => l.toUpperCase().includes('WHERE')))
    })

    it('resolveSnapshotPlan：无 parser 时仅 grammar', () => {
        const sql = 'SELECT * FROM orders t1 '
        const ctx = analyzeSqlCompletionContext(sql, sql.length, TABLES, COLUMNS)
        const resolved = resolveSnapshotPlan(ctx, sql, sql.length, {parser: null})
        assert.equal(resolved.stage, 'table.clause_next')
        assert.ok(Array.isArray(resolved.plan.parserKeywords))
        assert.ok(resolved.plan.parserKeywords?.includes('WHERE'))
        assert.equal(resolved.plan.stage, resolved.stage)
    })

    it('caretFromOffset 行列正确', () => {
        const sql = 'SELECT\n  id'
        assert.deepEqual(caretFromOffset(sql, sql.length), {lineNumber: 2, column: 5})
    })
})
