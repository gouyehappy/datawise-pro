/**
 * 回归测试 — 已修复 Bug 与关键交互场景
 *
 * 约定：
 * - 每修复一个 Bug → 在本文件新增 BUG-xxx 用例（附场景说明）
 * - 每添加补全相关功能 → 在对应模块测试 + 必要时在此补交互用例
 * - 提交前执行：npm run typecheck && npm run test
 *
 * @see docs/TESTING.md
 */

import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {isCursorInStringOrComment, codeParenDepthAt} from '../completion/sql-scan.ts'
import {
    allowsEmptyPrefixCompletion,
    shouldAbortCompletion,
    shouldSuppressEmptyPrefixCompletion,
} from '../completion/policy/guards.ts'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {groupBySelectItems, parseSelectListItems} from '../completion/select-list.ts'
import {parseCteAliasesVisibleAt} from '../utils/parse-references.ts'
import {filterColumnsForCompletion} from '../completion/schema-column-index.ts'
import {matchesColumnPrefix} from '../utils/expand-columns.ts'
import {
    clearAnalysisCache,
    getCachedAnalysis,
    getCachedSnapshot,
    schemaFingerprint
} from '../completion/analysis-cache.ts'
import {analyzeCompletion, warmCompletionSnapshot} from '../completion/core/snapshot.ts'
import {matchesKeywordPrefix} from '../completion/filter-text.ts'
import {shouldOfferKeywordAtCursor} from '../completion/completed-keyword.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {suggestTableAlias} from '../utils/alias-from-name.ts'
import {parseTableAliases, statementBoundsAtOffset, stripSqlForParsing} from '../utils/parse-references.ts'
import {scanModeAtCached, resetIncrementalScanCache} from '../completion/incremental-scan.ts'
import {sqlScanModeAt} from '../completion/sql-scan.ts'

const Invoke = 0
const TriggerCharacter = 1

const TAG_TABLES = ['orders', 'users', 'order_items', 'items']
const TAG_COLUMNS = {
    orders: [{name: 'id'}, {name: 'amount'}, {name: 'status'}, {name: 'created_at'}],
    users: [{name: 'id', type: 'int', pk: true}],
    order_items: [{name: 'order_id', type: 'int'}],
    items: [{name: 'user_id', type: 'int'}],
}

function ctxAt(sql: string, marker = '|') {
    const offset = sql.indexOf(marker)
    const clean = sql.replace(marker, '')
    return {ctx: analyzeSqlCompletionContext(clean, offset, TAG_TABLES, TAG_COLUMNS), offset, clean}
}

describe('regression — completion guards', () => {
    it('BUG-001 空行自动触发不弹补全（Ctrl+Space 除外）', () => {
        const sql = 'SELECT \n|'
        const offset = sql.indexOf('|')
        const clean = sql.replace('|', '')
        const ctx = analyzeSqlCompletionContext(clean, offset, TAG_TABLES, TAG_COLUMNS)
        assert.equal(shouldSuppressEmptyPrefixCompletion('', ctx, TriggerCharacter), true)
        assert.equal(shouldSuppressEmptyPrefixCompletion('', ctx, Invoke), false)
    })

    it('BUG-002 字符串字面量内不补全', () => {
        const sql = "SELECT * FROM users WHERE name = '|'"
        const offset = sql.indexOf('|')
        const clean = sql.replace('|', '')
        assert.equal(isCursorInStringOrComment(clean, offset), true)
        const ctx = analyzeSqlCompletionContext(clean, offset, TAG_TABLES, TAG_COLUMNS)
        assert.equal(
            shouldAbortCompletion({sql: clean, offset, prefix: '', ctx, triggerKind: TriggerCharacter}),
            true,
        )
    })

    it('BUG-003 alias. 空前缀应允许补全', () => {
        const sql = 'SELECT * FROM users u WHERE u.|'
        const offset = sql.indexOf('|')
        const clean = sql.replace('|', '')
        const ctx = analyzeSqlCompletionContext(clean, offset, TAG_TABLES, TAG_COLUMNS)
        assert.equal(ctx.slot, 'column_ref')
        assert.equal(allowsEmptyPrefixCompletion(ctx), true)
        assert.equal(
            shouldAbortCompletion({sql: clean, offset, prefix: '', ctx, triggerKind: TriggerCharacter}),
            false,
        )
    })

    it('BUG-008 FROM 行表名后已有别名则中止补全', () => {
        const sql = 'SELECT * FROM orders| t1\nWHERE 1=1'
        const {ctx, offset, clean} = ctxAt(sql)
        assert.equal(ctx.slot, 'from')
        assert.equal(ctx.fromJoin?.aliasOnLineAfterCursor, 't1')
        assert.equal(ctx.fromJoin?.tableClauseComplete, true)
        assert.equal(
            shouldAbortCompletion({sql: clean, offset, prefix: '', ctx, triggerKind: TriggerCharacter}),
            true,
        )
    })

    it('BUG-020 FROM 表名未输完时别名在光标后仍应补全', () => {
        const sql = 'SELECT *\nFROM ord| t1\nWHERE 1=1'
        const {ctx, offset, clean} = ctxAt(sql)
        assert.equal(ctx.fromJoin?.aliasOnLineAfterCursor, 't1')
        assert.equal(ctx.fromJoin?.tableClauseComplete, false)
        assert.equal(ctx.fromJoin?.tablePrefix, 'ord')
        assert.equal(
            shouldAbortCompletion({sql: clean, offset, prefix: 'ord', ctx, triggerKind: TriggerCharacter}),
            false,
        )
    })

    it('BUG-019 FROM 表别名后输入 left 应提示 LEFT JOIN', () => {
        const sql = 'SELECT t1.amount\nFROM orders t1 left\nWHERE 1=1'
        const offset = sql.indexOf('left') + 'left'.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TAG_TABLES, TAG_COLUMNS)
        assert.equal(ctx.fromJoin?.tableClauseComplete, true)
        assert.equal(ctx.fromJoin?.joinKeywordPrefix, 'left')
        assert.equal(ctx.fromJoin?.aliasOnLineAfterCursor, null)
        assert.equal(
            shouldAbortCompletion({sql, offset, prefix: 'left', ctx, triggerKind: TriggerCharacter}),
            false,
        )
        assert.ok(matchesKeywordPrefix('LEFT JOIN', 'left'))
        assert.ok(matchesKeywordPrefix('WHERE', ''))
    })

    it('BUG-019b FROM 表别名已定（无 JOIN 词）仍提示 WHERE/JOIN', () => {
        const sql = 'SELECT * FROM orders t1\nWHERE 1=1'
        const offset = sql.indexOf('t1') + 't1'.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TAG_TABLES, TAG_COLUMNS)
        assert.equal(ctx.fromJoin?.tableClauseComplete, true)
        assert.equal(ctx.fromJoin?.aliasOnLineAfterCursor, null)
        assert.equal(
            shouldAbortCompletion({sql, offset, prefix: '', ctx, triggerKind: TriggerCharacter}),
            false,
        )
        assert.equal(allowsEmptyPrefixCompletion(ctx), true)
    })

    it('BUG-021 LEFT JOIN 后优先表名而非重复 JOIN 关键字', () => {
        const sql = 'SELECT *\nFROM orders t1 LEFT JOIN \nWHERE 1=1'
        const offset = sql.indexOf('LEFT JOIN') + 'LEFT JOIN '.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TAG_TABLES, TAG_COLUMNS)
        assert.equal(ctx.slot, 'join')
        assert.equal(ctx.fromJoin?.awaitingJoinTable, true)
        assert.equal(ctx.fromJoin?.tableClauseComplete, false)
        assert.equal(ctx.fromJoin?.joinKeywordPrefix, null)
        assert.equal(
            shouldAbortCompletion({sql, offset, prefix: '', ctx, triggerKind: TriggerCharacter}),
            false,
        )
    })

    it('BUG-022 JOIN 右表+别名后应进入 ON 阶段而非重复 JOIN', () => {
        const sql = 'SELECT * FROM orders t1 LEFT JOIN users u|'
        const offset = sql.indexOf('|')
        const clean = sql.replace('|', '')
        const ctx = analyzeSqlCompletionContext(clean, offset, TAG_TABLES, TAG_COLUMNS)
        assert.equal(ctx.fromJoin?.awaitingOnClause, true)
        assert.equal(ctx.fromJoin?.tableClauseComplete, false)
        assert.equal(allowsEmptyPrefixCompletion(ctx), true)
        assert.equal(
            shouldAbortCompletion({sql: clean, offset, prefix: '', ctx, triggerKind: TriggerCharacter}),
            false,
        )
    })

    it('BUG-023 多行 SELECT * FROM 后不应重复提示 FROM 关键字', () => {
        const sql = 'SELECT\n*\nFROM|'
        const offset = sql.indexOf('|')
        const clean = sql.replace('|', '')
        const ctx = analyzeSqlCompletionContext(clean, offset, TAG_TABLES, TAG_COLUMNS)
        assert.equal(ctx.slot, 'from')
        assert.ok(!ctx.fromJoin?.awaitingTableName)
        assert.equal(shouldOfferKeywordAtCursor('FROM', 'FROM', ''), false)
        assert.equal(
            shouldAbortCompletion({sql: clean, offset, prefix: '', ctx, triggerKind: TriggerCharacter}),
            true,
        )
    })

    it('BUG-024 FROM 后输入空格再提示表名', () => {
        const sql = 'SELECT\n*\nFROM |'
        const offset = sql.indexOf('|')
        const clean = sql.replace('|', '')
        const ctx = analyzeSqlCompletionContext(clean, offset, TAG_TABLES, TAG_COLUMNS)
        assert.equal(ctx.fromJoin?.awaitingTableName, true)
        const plan = resolveCompletionPlan(ctx)
        assert.equal(plan.collectors.includes('tables'), true)
        assert.equal(plan.collectors.includes('keywords'), false)
        assert.equal(
            shouldAbortCompletion({sql: clean, offset, prefix: '', ctx, triggerKind: TriggerCharacter}),
            false,
        )
    })

    it('BUG-023b WHERE/ON 完整后不再重复该关键字', () => {
        assert.equal(shouldOfferKeywordAtCursor('SELECT * FROM users WHERE ', 'WHERE', ''), false)
        assert.equal(shouldOfferKeywordAtCursor('FROM a JOIN b ON ', 'ON', ''), false)
    })

    it('BUG-025 表别名由表名缩写且语句内唯一', () => {
        assert.equal(suggestTableAlias('order_items', new Set()), 'oi')
        const afterItems = new Set(['oi'])
        assert.equal(suggestTableAlias('user_profile', afterItems), 'up')
        const joinFirst = new Set(['us'])
        assert.equal(suggestTableAlias('order_items', joinFirst), 'oi')
    })

    it('BUG-026 SELECT * 不应读取同句光标之后的 FROM 别名', () => {
        const tables = ['cdp_tag', 'cdp_segment']
        const sql = 'SELECT *|\nFROM cdp_tag cdta\nWHERE 1=1'
        const offset = sql.indexOf('|')
        const clean = sql.replace('|', '')
        const ctx = analyzeSqlCompletionContext(clean, offset, tables, {})
        assert.equal(ctx.slot, 'select_list')
        assert.equal(Object.keys(ctx.aliases).length, 0)
    })

    it('BUG-027 新语句别名不受上一条 SQL 占用影响', () => {
        const tables = ['cdp_tag', 'cdp_segment']
        const sql = 'SELECT * FROM cdp_tag ct;\nSELECT * FROM cdp_tag'
        const offset = sql.length
        const stmt = stripSqlForParsing(statementBoundsAtOffset(sql, offset).text)
        const aliases = parseTableAliases(stmt, tables)
        const used = new Set(Object.keys(aliases))
        assert.equal(suggestTableAlias('cdp_tag', used), 'ct')
    })

    it('BUG-028 ON 条件写完后应提示 WHERE（含 wher 前缀）', () => {
        const tables = ['cdp_tag', 'cdp_segment']
        const columns = {
            cdp_tag: [{name: 'id'}],
            cdp_segment: [{name: 'id'}, {name: 'tag_ids'}],
        }
        const sql =
            'SELECT * FROM cdp_tag ct LEFT JOIN cdp_segment cs ON ct.id = cs.tag_ids wher'
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, tables, columns)
        const plan = resolveCompletionPlan(ctx)
        assert.equal(ctx.signals.after_complete_on_predicate, true)
        assert.equal(plan.keywordSlot, 'after_on')
        assert.equal(plan.collectors.includes('keywords'), true)
        assert.equal(shouldOfferKeywordAtCursor(sql, 'WHERE', 'wher'), true)
    })
})

describe('regression — alias resolution', () => {
    it('BUG-004 SELECT 写在 FROM 上方时 t1. 仍能解析别名', () => {
        const sql = 'SELECT t1.\nFROM orders t1\nWHERE 1=1'
        const offset = sql.indexOf('.') + 1
        const ctx = analyzeSqlCompletionContext(sql, offset, TAG_TABLES, TAG_COLUMNS)
        assert.equal(ctx.slot, 'column_ref')
        assert.equal(ctx.qualifier, 't1')
        assert.equal(ctx.resolvedTable, 'orders')
        assert.equal(ctx.aliases.t1, 'orders')
        assert.equal(
            shouldAbortCompletion({sql, offset, prefix: '', ctx, triggerKind: TriggerCharacter}),
            false,
        )
    })

    it('BUG-005 子查询内不泄漏外层表别名', () => {
        const sql = 'SELECT * FROM orders o WHERE o.id IN (SELECT user_id FROM items WHERE |)'
        const {ctx} = ctxAt(sql)
        assert.equal(ctx.aliases.o, undefined)
        assert.equal(ctx.aliases.items, 'items')
    })
})

describe('regression — lexer & scope', () => {
    it('BUG-006 字符串内括号不影响词法括号深度', () => {
        const sql = "WHERE x = '(a|'"
        const offset = sql.indexOf('|')
        assert.equal(codeParenDepthAt(sql.replace('|', ''), offset), 0)
    })

    it('BUG-011 CTE 体内只见已定义完毕的前序 CTE', () => {
        const sql = 'WITH a AS (SELECT 1 x), b AS (SELECT | FROM a) SELECT * FROM b'
        const offset = sql.indexOf('|')
        const visible = parseCteAliasesVisibleAt(sql.replace('|', ''), offset)
        assert.equal(visible.a, 'a')
        assert.equal(visible.b, undefined)
    })
})

describe('regression — predicate & clause semantics', () => {
    it('BUG-007 = 后进入谓词值补全上下文', () => {
        const sql = 'SELECT * FROM users WHERE status = |'
        const {ctx} = ctxAt(sql)
        assert.equal(ctx.signals.after_predicate_operator, true)
        assert.equal(ctx.slot, 'where')
    })

    it('BUG-009 GROUP BY 不包含聚合列', () => {
        const segment =
            'SELECT status, COUNT(*) AS cnt, t1.created_at AS created FROM orders t1 WHERE 1=1 GROUP BY '
        const groupItems = groupBySelectItems(segment)
        assert.equal(groupItems.length, 2)
        assert.equal(groupItems.some((i) => i.alias === 'cnt'), false)
        assert.equal(groupItems.some((i) => i.aggregate), false)
    })

    it('BUG-010 ORDER BY 列输入完成后识别 ASC/DESC 阶段', () => {
        const sql = 'SELECT status FROM orders GROUP BY status ORDER BY status'
        const ctx = analyzeSqlCompletionContext(sql, sql.length, TAG_TABLES, TAG_COLUMNS)
        assert.equal(ctx.slot, 'order_by')
        assert.equal(ctx.signals.after_complete_column_ref, true)
    })

    it('BUG-010b ORDER BY 已有 ASC 不再触发列完成态', () => {
        const sql = 'SELECT status FROM orders ORDER BY status ASC'
        const ctx = analyzeSqlCompletionContext(sql, sql.length, TAG_TABLES, TAG_COLUMNS)
        assert.equal(ctx.signals.after_complete_column_ref, false)
    })
})

describe('regression — performance', () => {
    it('BUG-013 大 SQL 上下文分析应在合理时间内完成', () => {
        const chunk = 'SELECT col, COUNT(*) cnt FROM big_table t1 WHERE col = 1\n'
        const sql = chunk.repeat(800) + 'SELECT t1.\nFROM big_table t1'
        const offset = sql.indexOf('t1.') + 3
        const start = performance.now()
        const ctx = analyzeSqlCompletionContext(sql, offset, ['big_table'], {
            big_table: [{name: 'col'}, {name: 'tag_name'}],
        })
        const elapsed = performance.now() - start
        assert.equal(ctx.resolvedTable, 'big_table')
        assert.ok(elapsed < 300, `analyze took ${elapsed.toFixed(0)}ms`)
    })

    it('BUG-014 嵌套子查询作用域提取不二次扫描', () => {
        const inner = 'SELECT user_id FROM items WHERE '.repeat(200)
        const sql = `SELECT * FROM orders o WHERE o.id IN (${inner}|)`
        const offset = sql.indexOf('|')
        const start = performance.now()
        const ctx = analyzeSqlCompletionContext(sql.replace('|', ''), offset, TAG_TABLES, TAG_COLUMNS)
        const elapsed = performance.now() - start
        assert.equal(ctx.aliases.o, undefined)
        assert.equal(ctx.aliases.items, 'items')
        assert.ok(elapsed < 200, `nested scope took ${elapsed.toFixed(0)}ms`)
    })
})

describe('regression — enum values (P1-2)', () => {
    it('BUG-012 带 enumValues 的列在 = 后进入谓词值补全', () => {
        const sql = 'SELECT * FROM users WHERE status = '
        const columns = {
            ...TAG_COLUMNS,
            users: [
                {name: 'id', type: 'int'},
                {name: 'status', type: 'varchar', enumValues: ['active', 'inactive']},
            ],
        }
        const ctx = analyzeSqlCompletionContext(sql, sql.length, TAG_TABLES, columns)
        assert.equal(ctx.slot, 'where')
        assert.equal(ctx.signals.after_predicate_operator, true)
        assert.deepEqual(columns.users[1].enumValues, ['active', 'inactive'])
    })
})

describe('regression — performance (P1–P3)', () => {
    it('BUG-015 宽表列前缀过滤与全量扫描结果一致', () => {
        const cols = Array.from({length: 600}, (_, i) => ({name: `col_${String(i).padStart(3, '0')}`}))
        cols.push({name: 'tag_name'}, {name: 'user_id'})

        const prefix = 'tag'
        const filtered = filterColumnsForCompletion(cols, prefix)
        const expected = cols.filter((c) => matchesColumnPrefix(c.name, prefix))
        assert.deepEqual(
            filtered.map((c) => c.name).sort(),
            expected.map((c) => c.name).sort(),
        )
        assert.ok(filtered.length < cols.length)
    })

    it('BUG-016 SELECT 列表解析 memo 同 segment 复用', () => {
        const segment = 'SELECT id, COUNT(*) cnt, name AS user_name FROM users'
        const a = parseSelectListItems(segment)
        const b = parseSelectListItems(segment)
        assert.equal(a, b)
        assert.equal(a.length, 3)
    })

    it('BUG-017 分析 LRU 缓存命中', () => {
        clearAnalysisCache()
        const sql = 'SELECT * FROM users WHERE '
        const offset = sql.length
        const key = schemaFingerprint(TAG_TABLES, TAG_COLUMNS)
        assert.equal(getCachedAnalysis(sql, offset, key), null)
        const ctx = analyzeSqlCompletionContext(sql, offset, TAG_TABLES, TAG_COLUMNS)
        const hit = getCachedAnalysis(sql, offset, key)
        assert.ok(hit)
        assert.equal(hit.slot, ctx.slot)
    })

    it('BUG-019 CompletionSnapshot 缓存 HintBar/Provider 共用', () => {
        clearAnalysisCache()
        const sql = 'SELECT * FROM users WHERE '
        const offset = sql.length
        const key = schemaFingerprint(TAG_TABLES, TAG_COLUMNS)
        assert.equal(getCachedSnapshot(sql, offset, key), null)
        const ctx = analyzeSqlCompletionContext(sql, offset, TAG_TABLES, TAG_COLUMNS)
        const warmed = warmCompletionSnapshot(sql, offset, key, ctx)
        const hit = getCachedSnapshot(sql, offset, key)
        assert.ok(hit)
        assert.equal(hit.stage, warmed.stage)
        const viaAnalyze = analyzeCompletion(
            sql,
            offset,
            TAG_TABLES,
            TAG_COLUMNS,
            analyzeSqlCompletionContext,
        )
        assert.equal(viaAnalyze, hit)
    })

    it('BUG-018 增量 scan 与全量 scan 结果一致', () => {
        const sql = "SELECT * FROM users WHERE name = 'O\\'Brien' -- comment\nAND id = 1"
        resetIncrementalScanCache()
        for (let offset = 0; offset <= sql.length; offset++) {
            assert.equal(scanModeAtCached(sql, offset), sqlScanModeAt(sql, offset), `offset ${offset}`)
        }
        const edited = sql.replace('users', 'orders')
        for (let offset = 0; offset <= edited.length; offset++) {
            assert.equal(scanModeAtCached(edited, offset), sqlScanModeAt(edited, offset), `edited offset ${offset}`)
        }
    })
})
