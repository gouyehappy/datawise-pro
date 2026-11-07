/**
 * 关键字体验增强回归：片段插入 / 缩写 / 整词优先 / 谓词未闭合 / 结构感知排序
 */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {
    resolveCompletionKeywords,
    rankEmptyPrefixTop,
    filterOperatorsByValueKind,
    nextKeywordHintsForPlan,
} from '../completion/plan-keywords.ts'
import {matchesKeywordPrefix, keywordFilterText} from '../completion/filter-text.ts'
import {preferFullPhraseKeywords, matchesKeywordAbbreviation} from '../completion/keyword-abbreviations.ts'
import {buildKeywordInsert, structureKeywordsForSlot} from '../completion/keyword-insert.ts'
import {
    detectAfterCompleteWherePredicate,
    segmentEndsWithOperator,
} from '../completion/grammar/transitions/predicate.ts'
import {collectKeywordSuggestions} from '../completion/builders/keyword-snippet-collectors.ts'
import {createSqlEditorRuntime, setActiveSqlEditorRuntime} from '../runtime/sql-editor-runtime.ts'
import {SUGGEST_INSERT_AS_SNIPPET} from '../completion/suggest-types.ts'

const TABLES = ['orders', 'users', 'items']
const COLUMNS = {
    orders: [
        {name: 'id', type: 'int'},
        {name: 'status', type: 'varchar(32)'},
        {name: 'amount', type: 'decimal'},
        {name: 'user_id', type: 'int'},
    ],
    users: [
        {name: 'id', type: 'int'},
        {name: 'name', type: 'varchar(64)'},
    ],
    items: [{name: 'id', type: 'int'}, {name: 'order_id', type: 'int'}],
}

function at(sql: string) {
    const offset = sql.indexOf('|')
    assert.ok(offset >= 0, sql)
    const clean = sql.replace('|', '')
    const ctx = analyzeSqlCompletionContext(clean, offset, TABLES, COLUMNS)
    const plan = resolveCompletionPlan(ctx)
    return {ctx, plan, clean, offset}
}

function keywordsAt(sql: string, prefix = '') {
    const {ctx, plan} = at(sql)
    return resolveCompletionKeywords(ctx, plan, {prefix}).map((k) => k.toUpperCase())
}

describe('keyword-insert — snippets + chain', () => {
    it('WHERE / LEFT JOIN 生成占位片段', () => {
        const where = buildKeywordInsert('WHERE', {lineBefore: 'SELECT * FROM t '})
        assert.equal(where.asSnippet, true)
        assert.equal(where.chainSuggest, true)
        assert.ok(where.insertText.includes('$0'))
        assert.ok(where.insertText.includes('\nWHERE'))

        const join = buildKeywordInsert('LEFT JOIN', {lineBefore: 'SELECT * FROM t '})
        assert.equal(join.asSnippet, true)
        assert.ok(join.insertText.includes('${1:table}'))
        assert.ok(join.insertText.includes('ON'))
    })

    it('运算符保持纯文本回退', () => {
        const eq = buildKeywordInsert('=', {trailingSpaceFallback: false})
        assert.equal(eq.asSnippet, false)
        assert.equal(eq.insertText.trim(), '=')
    })

    it('collectKeywordSuggestions：clause-next 使用 snippet + triggerSuggest', () => {
        const {ctx, plan, clean, offset} = at('SELECT * FROM users |')
        const items: {
            insertText: string
            insertTextRules?: string
            command?: {id: string}
            label: unknown
        }[] = []
        collectKeywordSuggestions(
            ctx,
            (item) => items.push(item),
            {
                lineAtRange: clean,
                fullSql: clean,
                cursorOffset: offset,
                lineBeforeCursor: clean.slice(0, offset),
            },
            {startLineNumber: 1, startColumn: offset + 1, endLineNumber: 1, endColumn: offset + 1},
            '',
            plan,
        )
        const where = items.find((i) => {
            const label = typeof i.label === 'string' ? i.label : (i.label as {label?: string})?.label
            return String(label).toUpperCase().includes('WHERE')
        })
        assert.ok(where, 'expected WHERE')
        assert.equal(where!.insertTextRules, SUGGEST_INSERT_AS_SNIPPET)
        assert.ok(where!.insertText.includes('WHERE'))
        assert.equal(where!.command?.id, 'editor.action.triggerSuggest')
    })
})

describe('keyword abbreviations + full phrase', () => {
    it('lj / gb / ob 缩写匹配', () => {
        assert.equal(matchesKeywordAbbreviation('LEFT JOIN', 'lj'), true)
        assert.equal(matchesKeywordAbbreviation('LEFT JOIN', 'l'), false)
        assert.equal(matchesKeywordPrefix('LEFT JOIN', 'lj'), true)
        assert.equal(matchesKeywordPrefix('GROUP BY', 'gb'), true)
        assert.equal(matchesKeywordPrefix('ORDER BY', 'ob'), true)
        // 首词前缀仍可用（left → LEFT JOIN）
        assert.equal(matchesKeywordPrefix('LEFT JOIN', 'lef'), true)
        assert.ok(keywordFilterText('LEFT JOIN').includes('lj'))
    })

    it('空前缀隐藏 LEFT / GROUP 限定词', () => {
        const filtered = preferFullPhraseKeywords(
            ['WHERE', 'LEFT', 'LEFT JOIN', 'GROUP', 'GROUP BY', 'ORDER', 'ORDER BY'],
            '',
        ).map((k) => k.toUpperCase())
        assert.equal(filtered.includes('LEFT'), false)
        assert.equal(filtered.includes('GROUP'), false)
        assert.equal(filtered.includes('ORDER'), false)
        assert.equal(filtered.includes('LEFT JOIN'), true)
        assert.equal(filtered.includes('GROUP BY'), true)
    })

    it('prefix left：只出 LEFT JOIN 不出 LEFT', () => {
        const kws = keywordsAt('SELECT * FROM users |', 'left')
        assert.equal(kws.includes('LEFT JOIN'), true)
        assert.equal(kws.includes('LEFT'), false)
    })

    it('缩写 lj 在 after_table 命中 LEFT JOIN', () => {
        const kws = keywordsAt('SELECT * FROM users |', 'lj')
        assert.equal(kws.includes('LEFT JOIN'), true)
    })
})

describe('predicate incomplete — no clause-next', () => {
    it('函数括号未闭合 → endsWithOperator', () => {
        assert.equal(segmentEndsWithOperator('SELECT * FROM users WHERE UPPER(name'), true)
        assert.equal(
            detectAfterCompleteWherePredicate('SELECT * FROM users WHERE UPPER(name', 'where'),
            false,
        )
    })

    it('EXISTS 括号未闭合 → 不 complete', () => {
        assert.equal(
            detectAfterCompleteWherePredicate(
                'SELECT * FROM users WHERE EXISTS (SELECT 1 FROM orders WHERE',
                'where',
            ),
            false,
        )
    })

    it('完整函数谓词 → complete', () => {
        assert.equal(
            detectAfterCompleteWherePredicate(
                "SELECT * FROM users WHERE UPPER(name) = 'A'",
                'where',
            ),
            true,
        )
    })
})

describe('schema / structure ranking', () => {
    it('有聚合无 GROUP BY：after_table 抬高 GROUP BY', () => {
        const {ctx} = at('SELECT COUNT(*) FROM users |')
        const ranked = rankEmptyPrefixTop(
            'after_table',
            ['WHERE', 'LEFT JOIN', 'INNER JOIN', 'GROUP BY', 'ORDER BY'],
            ctx,
        )
        assert.equal(ranked[0], 'GROUP BY')
    })

    it('有 outbound FK：抬高 JOIN', () => {
        const runtime = createSqlEditorRuntime()
        runtime.setSchema({
            tables: TABLES,
            columns: COLUMNS,
            foreignKeys: [{fromTable: 'orders', fromColumn: 'user_id', toTable: 'users', toColumn: 'id'}],
        })
        setActiveSqlEditorRuntime(runtime, {sync: false})
        try {
            const {ctx} = at('SELECT * FROM orders |')
            const ranked = rankEmptyPrefixTop(
                'after_table',
                ['WHERE', 'LEFT JOIN', 'INNER JOIN', 'GROUP BY', 'ORDER BY'],
                ctx,
            )
            assert.equal(ranked[0], 'LEFT JOIN')
        } finally {
            setActiveSqlEditorRuntime(createSqlEditorRuntime(), {sync: false})
        }
    })

    it('nextKeywordHints 与 ranking 同源', () => {
        const {ctx, plan} = at('SELECT COUNT(*) FROM users |')
        const hints = nextKeywordHintsForPlan(plan, ctx)
        assert.equal(hints[0], 'GROUP BY')
    })
})

describe('structure keywords + dialect operators', () => {
    it('case / over / with 前缀命中结构片段', () => {
        assert.equal(structureKeywordsForSlot('select_list', 'ca').some((s) => s.label === 'CASE'), true)
        assert.equal(structureKeywordsForSlot('select_list', 'over').some((s) => s.label === 'OVER'), true)
        assert.equal(structureKeywordsForSlot('statement_start', 'wi').some((s) => s.label === 'WITH'), true)
        assert.equal(structureKeywordsForSlot('select_list', '').length, 0)
    })

    it('字符串运算符保留 ILIKE（方言关键字经白名单交集）', () => {
        const ops = filterOperatorsByValueKind(['=', 'LIKE', 'ILIKE', '>'], 'string')
        assert.equal(ops.includes('ILIKE'), true)
        assert.equal(ops.includes('>'), false)
    })
})
