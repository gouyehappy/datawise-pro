/**
 * 关键字槽位黄金回归 — 防止坏位置再次放出 JOIN / WHERE / ORDER BY 等
 */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {resolveCompletionKeywords} from '../completion/plan-keywords.ts'
import {shouldRunCollector} from '../completion/policy/collector-gate.ts'
import {detectAfterCompleteWherePredicate} from '../completion/grammar/transitions/predicate.ts'
import {resolvePredicateLeftColumn} from '../completion/predicate-column.ts'
import {classifyColumnType} from '../completion/column-type.ts'
import {filterOperatorsByValueKind} from '../completion/plan-keywords.ts'

const TABLES = ['orders', 'users', 'items']
const COLUMNS = {
    orders: [
        {name: 'id', type: 'int'},
        {name: 'status', type: 'varchar(32)'},
        {name: 'amount', type: 'decimal'},
    ],
    users: [
        {name: 'id', type: 'int'},
        {name: 'name', type: 'varchar(64)'},
        {name: 'email', type: 'varchar(128)'},
    ],
    items: [{name: 'id', type: 'int'}, {name: 'user_id', type: 'int'}],
}

function at(sql: string) {
    const offset = sql.indexOf('|')
    assert.ok(offset >= 0, sql)
    const clean = sql.replace('|', '')
    const ctx = analyzeSqlCompletionContext(clean, offset, TABLES, COLUMNS)
    const plan = resolveCompletionPlan(ctx)
    return {ctx, plan, clean}
}

function keywordsAt(sql: string, prefix = '') {
    const {ctx, plan} = at(sql)
    return resolveCompletionKeywords(ctx, plan, {prefix}).map((k) => k.toUpperCase())
}

describe('keyword-slot regression — forbidden keywords', () => {
    it('WHERE 完整后不得出现 JOIN / WHERE', () => {
        const kws = keywordsAt('SELECT * FROM users WHERE status = 1 |')
        assert.equal(kws.some((k) => k.includes('JOIN')), false)
        assert.equal(kws.includes('WHERE'), false)
        assert.equal(kws.includes('GROUP BY') || kws.includes('ORDER BY') || kws.includes('AND'), true)
    })

    it('GROUP BY 完整后不得出现 WHERE / JOIN', () => {
        const kws = keywordsAt('SELECT status FROM orders GROUP BY status |')
        assert.equal(kws.includes('WHERE'), false)
        assert.equal(kws.some((k) => k.includes('JOIN')), false)
    })

    it('HAVING 完整后不得出现 WHERE / JOIN / GROUP BY', () => {
        const kws = keywordsAt(
            'SELECT status FROM orders GROUP BY status HAVING status = 1 |',
        )
        assert.equal(kws.includes('WHERE'), false)
        assert.equal(kws.includes('GROUP BY'), false)
        assert.equal(kws.some((k) => k.includes('JOIN')), false)
        assert.equal(kws.includes('ORDER BY') || kws.includes('LIMIT'), true)
    })

    it('ORDER BY ASC 后不得出现 WHERE / JOIN', () => {
        const kws = keywordsAt('SELECT id FROM orders ORDER BY id ASC |')
        assert.equal(kws.includes('WHERE'), false)
        assert.equal(kws.some((k) => k.includes('JOIN')), false)
        assert.equal(kws.includes('LIMIT') || kws.includes('OFFSET'), true)
    })

    it('SELECT 列表 prefix 不得放出 ORDER BY', () => {
        const kws = keywordsAt('SELECT ord|', 'ord')
        assert.equal(kws.includes('ORDER BY'), false)
        assert.equal(kws.includes('WHERE'), false)
    })
})

describe('keyword-slot regression — predicate forms', () => {
    it('IN 列表完整 → WHERE complete', () => {
        const segment = 'SELECT * FROM users WHERE id IN (1, 2, 3)'
        assert.equal(detectAfterCompleteWherePredicate(segment, 'where'), true)
        const {plan} = at(`${segment} |`)
        assert.equal(plan.keywordSlot, 'after_where')
    })

    it('BETWEEN 完整 → WHERE complete', () => {
        const segment = 'SELECT * FROM orders WHERE amount BETWEEN 1 AND 10'
        assert.equal(detectAfterCompleteWherePredicate(segment, 'where'), true)
    })

    it('IS NOT NULL 完整 → WHERE complete', () => {
        const segment = 'SELECT * FROM users WHERE name IS NOT NULL'
        assert.equal(detectAfterCompleteWherePredicate(segment, 'where'), true)
    })

    it('LIKE 完整 → WHERE complete', () => {
        const segment = "SELECT * FROM users WHERE name LIKE 'a%'"
        assert.equal(detectAfterCompleteWherePredicate(segment, 'where'), true)
    })

    it('IN 未闭合 → 不 complete', () => {
        assert.equal(
            detectAfterCompleteWherePredicate('SELECT * FROM users WHERE id IN (1, 2', 'where'),
            false,
        )
    })

    it('BETWEEN 缺右界 → 不 complete', () => {
        assert.equal(
            detectAfterCompleteWherePredicate(
                'SELECT * FROM orders WHERE amount BETWEEN 1 AND',
                'where',
            ),
            false,
        )
    })
})

describe('keyword-slot regression — alias vs AS / snippets', () => {
    it('列后打别名前缀：不跑关键字收集器', () => {
        const {ctx, plan} = at('SELECT id u|')
        assert.equal(shouldRunCollector('keywords', plan, ctx, 'u'), false)
    })

    it('列后打 a：仍可提示 AS', () => {
        const {ctx, plan} = at('SELECT id a|')
        assert.equal(shouldRunCollector('keywords', plan, ctx, 'a'), true)
    })

    it('clause-next 空前缀：snippets 关闭', () => {
        const {ctx, plan} = at('SELECT * FROM users WHERE id = 1 |')
        assert.equal(shouldRunCollector('snippets', plan, ctx, ''), false)
        assert.equal(shouldRunCollector('keywords', plan, ctx, ''), true)
    })
})

describe('keyword-slot regression — operator type by column', () => {
    it('alias.col 解析类型 → 字符串过滤 >', () => {
        const left = resolvePredicateLeftColumn(
            'SELECT * FROM users u WHERE u.name ',
            {u: 'users'},
            ['users'],
            {tables: TABLES, columns: COLUMNS},
        )
        assert.ok(left)
        assert.equal(classifyColumnType(left!.meta.type), 'string')
        const ops = filterOperatorsByValueKind(['=', '>', 'LIKE', 'IN'], 'string')
        assert.equal(ops.includes('>'), false)
        assert.equal(ops.includes('LIKE'), true)
    })

    it('单表裸列解析类型 → numeric', () => {
        const left = resolvePredicateLeftColumn(
            'SELECT * FROM orders WHERE amount ',
            {},
            ['orders'],
            {tables: TABLES, columns: COLUMNS},
        )
        assert.ok(left)
        assert.equal(classifyColumnType(left!.meta.type), 'numeric')
    })
})
