/**
 * Grammar 矩阵 — 每条 GrammarStateRule 必须有 fixture，自动跑全覆盖
 */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {analyzeCompletion} from '../completion/core/snapshot.ts'
import {STAGE_PLAN_TEMPLATES} from '../completion/grammar/plans.ts'
import {
    SELECT_STATEMENT_GRAMMAR,
    getStatementGrammar,
    listAllStatementGrammars,
} from '../completion/grammar/definitions/index.ts'
import {GRAMMAR_FIXTURES} from '../completion/grammar/definitions/fixtures.ts'
import {
    grammarRuleKey,
    listAllGrammarStateRules,
} from '../completion/grammar/engine/iter-rules.ts'
import {resolveStageFromGrammar} from '../completion/grammar/engine/index.ts'
import {shouldRunCollector} from '../completion/policy/collector-gate.ts'
import {matchesKeywordPrefix} from '../completion/filter-text.ts'

const TABLES = ['orders', 'cdp_tag', 'cdp_segment', 't', 't1', 't2']
const COLUMNS = {
    orders: [{name: 'status'}, {name: 'id'}],
    cdp_tag: [{name: 'tag_name'}, {name: 'id'}],
    cdp_segment: [{name: 'tag_ids'}, {name: 'user_count'}],
    t: [{name: 'id'}],
    t1: [{name: 'id'}],
    t2: [{name: 'id'}],
}

function at(sql: string) {
    const offset = sql.indexOf('|')
    const clean = sql.replace('|', '')
    const pos = offset >= 0 ? offset : clean.length
    const ctx = analyzeSqlCompletionContext(clean, pos, TABLES, COLUMNS)
    const snapshot = analyzeCompletion(clean, pos, TABLES, COLUMNS, analyzeSqlCompletionContext)
    const resolution = resolveStageFromGrammar(ctx)
    return {ctx, snapshot, resolution}
}

describe('grammar definitions registry', () => {
    it('every statement kind has grammar', () => {
        const grammars = listAllStatementGrammars()
        assert.ok(grammars.length >= 7)
        for (const g of grammars) {
            assert.ok(g.clauses.length >= 1, g.statement)
            assert.ok(g.fallback)
        }
    })

    it('SELECT grammar documents all major clauses', () => {
        const ids = SELECT_STATEMENT_GRAMMAR.clauses.map((c) => c.id)
        for (const id of ['select_list', 'from', 'join', 'on', 'where', 'group_by', 'order_by']) {
            assert.ok(ids.includes(id), `missing clause ${id}`)
        }
    })

    it('every SELECT state maps to a plan template', () => {
        const stages = new Set<string>()
        for (const rule of SELECT_STATEMENT_GRAMMAR.globalRules) stages.add(rule.stage)
        for (const clause of SELECT_STATEMENT_GRAMMAR.clauses) {
            for (const state of clause.states) stages.add(state.stage)
        }
        for (const stage of stages) {
            assert.ok(STAGE_PLAN_TEMPLATES[stage as keyof typeof STAGE_PLAN_TEMPLATES], stage)
        }
    })
})

describe('grammar matrix fixture coverage', () => {
    const rules = listAllGrammarStateRules()

    it('every grammar state rule has a fixture', () => {
        const missing: string[] = []
        for (const rule of rules) {
            const key = grammarRuleKey(rule.statement, rule.clauseId, rule.stateId)
            if (!GRAMMAR_FIXTURES[key]) missing.push(key)
        }
        assert.equal(missing.length, 0, `missing fixtures:\n${missing.join('\n')}`)
    })

    it(`covers ${rules.length} state rules`, () => {
        assert.ok(rules.length >= 50, `expected 50+ rules, got ${rules.length}`)
    })
})

describe('grammar matrix — all state rules', () => {
    for (const rule of listAllGrammarStateRules()) {
        const key = grammarRuleKey(rule.statement, rule.clauseId, rule.stateId)
        const fixture = GRAMMAR_FIXTURES[key]

        it(`${key} → ${rule.stage}`, () => {
            assert.ok(fixture, `missing fixture for ${key}`)
            const {snapshot, resolution} = at(fixture.sql)
            assert.equal(resolution.stage, fixture.stage, `${key}: stage`)
            assert.equal(snapshot.stage, fixture.stage, `${key}: snapshot.stage`)
            const expectedStateId = fixture.stateId !== undefined ? fixture.stateId : rule.stateId
            assert.equal(resolution.stateId, expectedStateId, `${key}: stateId`)
            if (fixture.clauseId !== undefined) {
                assert.equal(resolution.clauseId, fixture.clauseId, `${key}: clauseId`)
            }
            if (fixture.hasColumns !== undefined) {
                assert.equal(snapshot.plan.collectors.includes('columns'), fixture.hasColumns, `${key}: columns`)
            }
            if (fixture.hasKeywords !== undefined) {
                assert.equal(snapshot.plan.collectors.includes('keywords'), fixture.hasKeywords, `${key}: keywords`)
            }
        })
    }
})

describe('grammar engine vs statement kind', () => {
    it('alias. → columns collector with empty prefix', () => {
        const {snapshot} = at('SELECT * FROM cdp_tag ct LEFT JOIN cdp_segment cs ON ct.|')
        assert.equal(snapshot.stage, 'column_ref.default')
        assert.equal(snapshot.context.resolvedTable, 'cdp_tag')
        assert.equal(
            shouldRunCollector('columns', snapshot.plan, snapshot.context, ''),
            true,
            'alias. should list columns without typing prefix',
        )
    })

    it('function arg alias. resolves table from forward FROM clause', () => {
        const {ctx, snapshot} = at('SELECT SUM(cs.|) FROM cdp_segment cs')
        assert.equal(ctx.slot, 'column_ref')
        assert.equal(ctx.qualifier, 'cs')
        assert.equal(ctx.resolvedTable, 'cdp_segment')
        assert.equal(snapshot.stage, 'column_ref.default')
        assert.equal(snapshot.plan.collectors.includes('columns'), true)
        assert.equal(snapshot.plan.collectors.includes('snippets'), false)
        assert.equal(
            shouldRunCollector('columns', snapshot.plan, snapshot.context, ''),
            true,
            'SUM(cs.) should list cdp_segment columns',
        )
    })

    it('ORDER BY column → ASC/DESC keywords', () => {
        const {snapshot} = at('SELECT * FROM cdp_tag ct ORDER BY ct.id |')
        assert.equal(snapshot.stage, 'order_by.after_column')
        assert.equal(snapshot.plan.keywordPhase, 'sort-direction')
        assert.equal(
            shouldRunCollector('keywords', snapshot.plan, snapshot.context, ''),
            true,
        )
        assert.equal(matchesKeywordPrefix('ASC', ''), true)
        assert.equal(matchesKeywordPrefix('DESC', ''), true)
    })

    it('ORDER BY column + de prefix → DESC', () => {
        const sql = 'SELECT * FROM cdp_tag ct ORDER BY ct.id de|'
        const clean = sql.replace('|', '')
        const offset = clean.length
        const snapshot = analyzeCompletion(clean, offset, TABLES, COLUMNS, analyzeSqlCompletionContext)
        assert.equal(snapshot.stage, 'order_by.after_column')
        assert.equal(snapshot.plan.keywordPhase, 'sort-direction')
        assert.equal(matchesKeywordPrefix('DESC', 'de'), true)
        assert.equal(
            shouldRunCollector('keywords', snapshot.plan, snapshot.context, 'de'),
            true,
        )
    })

    it('INSERT INTO → insert.columns', () => {
        const ctx = analyzeSqlCompletionContext('INSERT INTO |', 12, TABLES, COLUMNS)
        const r = resolveStageFromGrammar(ctx)
        assert.equal(r.stage, 'insert.columns')
        assert.equal(getStatementGrammar('insert').statement, 'insert')
    })
})
