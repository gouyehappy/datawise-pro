import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildExplainMetricPairs,
    isExplainAnalyzeStatement,
    isExplainStatement,
    parseExplainPlanResult,
    supportsExplainAnalyze,
    wrapExplainSql,
} from '@/features/workspace/services/explain-plan.service'

describe('explain plan service', () => {
    it('detects explain statements', () => {
        assert.equal(isExplainStatement('EXPLAIN SELECT 1'), true)
        assert.equal(isExplainStatement('explain analyze select 1'), true)
        assert.equal(isExplainStatement('SELECT 1'), false)
    })

    it('wraps sql per dialect', () => {
        assert.equal(
            wrapExplainSql('SELECT 1', 'postgresql'),
            'EXPLAIN (FORMAT JSON) SELECT 1',
        )
        assert.equal(
            wrapExplainSql('SELECT 1', 'sqlite'),
            'EXPLAIN QUERY PLAN SELECT 1',
        )
        assert.equal(
            wrapExplainSql('EXPLAIN SELECT 1', 'mysql'),
            'EXPLAIN SELECT 1',
        )
    })

    it('detects explain analyze statements', () => {
        assert.equal(isExplainAnalyzeStatement('EXPLAIN ANALYZE SELECT 1'), true)
        assert.equal(isExplainAnalyzeStatement('EXPLAIN (FORMAT JSON, ANALYZE) SELECT 1'), true)
        assert.equal(isExplainAnalyzeStatement('EXPLAIN SELECT 1'), false)
    })

    it('wraps analyze sql per dialect', () => {
        assert.equal(
            wrapExplainSql('SELECT 1', 'postgresql', true),
            'EXPLAIN (FORMAT JSON, ANALYZE) SELECT 1',
        )
        assert.equal(
            wrapExplainSql('SELECT 1', 'mysql', true),
            'EXPLAIN ANALYZE SELECT 1',
        )
    })

    it('reports analyze support by db type', () => {
        assert.equal(supportsExplainAnalyze('postgresql'), true)
        assert.equal(supportsExplainAnalyze('sqlite'), false)
    })

    it('builds estimate vs actual metric pairs', () => {
        const pairs = buildExplainMetricPairs({
            'Plan Rows': 100,
            'Actual Rows': 95,
            'Total Cost': 12.5,
            'Actual Total Time': 8.2,
        })
        assert.equal(pairs.length, 2)
        assert.deepEqual(pairs[0], {id: 'rows', estimate: 100, actual: 95})
    })

    it('parses postgres json explain output with analyze metrics', () => {
        const json = JSON.stringify([
            {
                Plan: {
                    'Node Type': 'Seq Scan',
                    'Relation Name': 'users',
                    'Startup Cost': 0,
                    'Total Cost': 10,
                    'Plan Rows': 100,
                    'Actual Rows': 98,
                    'Actual Total Time': 1.23,
                },
            },
        ])
        const plan = parseExplainPlanResult(
            [{name: 'QUERY PLAN', key: 'QUERY PLAN'}],
            [{'QUERY PLAN': json}],
            'postgresql',
        )
        assert.equal(plan.length, 1)
        assert.equal(plan[0].metricPairs?.length, 2)
    })

    it('parses sqlite explain query plan rows into a tree', () => {
        const plan = parseExplainPlanResult(
            [
                {name: 'id', key: 'id'},
                {name: 'parent', key: 'parent'},
                {name: 'detail', key: 'detail'},
            ],
            [
                {id: 1, parent: 0, detail: 'SCAN users'},
                {id: 2, parent: 1, detail: 'USE TEMP B-TREE FOR ORDER BY'},
            ],
            'sqlite',
        )
        assert.equal(plan.length, 1)
        assert.equal(plan[0].label, 'SCAN users')
        assert.equal(plan[0].children?.[0]?.label, 'USE TEMP B-TREE FOR ORDER BY')
    })

    it('parses mysql classic explain rows', () => {
        const plan = parseExplainPlanResult(
            [
                {name: 'table', key: 'table'},
                {name: 'type', key: 'type'},
                {name: 'select_type', key: 'select_type'},
                {name: 'Extra', key: 'Extra'},
            ],
            [{table: 'users', type: 'ALL', select_type: 'SIMPLE', Extra: 'Using where'}],
            'mysql',
        )
        assert.equal(plan.length, 1)
        assert.match(plan[0].label, /users/)
        assert.equal(plan[0].detail, 'ALL · Using where')
        assert.equal(plan[0].metrics?.select_type, 'SIMPLE')
    })

    it('parses mysql explain rows with generic cN column keys', () => {
        const plan = parseExplainPlanResult(
            [
                {name: 'id', key: 'c1'},
                {name: 'select_type', key: 'c2'},
                {name: 'table', key: 'c3'},
                {name: 'type', key: 'c5'},
                {name: 'rows', key: 'c10'},
                {name: 'Extra', key: 'c12'},
            ],
            [{
                c1: 1,
                c2: 'SIMPLE',
                c3: 't',
                c5: 'ALL',
                c10: 11,
                c12: 'Using temporary; Using filesort',
            }],
            'mysql',
        )
        assert.equal(plan.length, 1)
        assert.equal(plan[0].label, 't')
        assert.equal(plan[0].detail, 'ALL · Using temporary; Using filesort')
        assert.equal(plan[0].metrics?.rows, 11)
        assert.equal(plan[0].metrics?.select_type, 'SIMPLE')
    })

    it('parses postgres json explain output', () => {
        const json = JSON.stringify([
            {
                Plan: {
                    'Node Type': 'Seq Scan',
                    'Relation Name': 'users',
                    'Startup Cost': 0,
                    'Total Cost': 10,
                    'Plan Rows': 100,
                },
            },
        ])
        const plan = parseExplainPlanResult(
            [{name: 'QUERY PLAN', key: 'QUERY PLAN'}],
            [{'QUERY PLAN': json}],
            'postgresql',
        )
        assert.equal(plan.length, 1)
        assert.match(plan[0].label, /Seq Scan/)
    })
})
