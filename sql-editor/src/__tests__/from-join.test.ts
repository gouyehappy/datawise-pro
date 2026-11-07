import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    analyzeFromJoinTableState,
    clauseKeywordPrefix,
    joinQualifierPrefix,
} from '../completion/from-join.ts'

describe('completion/from-join', () => {
    it('clauseKeywordPrefix matches WHERE prefix', () => {
        assert.equal(clauseKeywordPrefix('whe'), 'whe')
        assert.equal(clauseKeywordPrefix('where'), 'where')
        assert.equal(clauseKeywordPrefix('ct'), null)
    })

    it('joinQualifierPrefix still matches left', () => {
        assert.equal(joinQualifierPrefix('left'), 'left')
    })

    it('FROM table alias + whe → clauseKeywordPrefix not alias=whe', () => {
        const sql = 'SELECT * FROM cdp_tag ct whe'
        const state = analyzeFromJoinTableState(
            'from',
            sql,
            sql,
            sql.length,
            ['cdp_tag'],
        )
        assert.equal(state?.clauseKeywordPrefix, 'whe')
        assert.equal(state?.tableClauseComplete, true)
        assert.equal(state?.joinKeywordPrefix, null)
    })

    it('FROM table + ord (no alias) stays tableClauseComplete for keyword replace', () => {
        const sql = 'SELECT * FROM flink_job ord'
        const state = analyzeFromJoinTableState(
            'from',
            sql,
            sql,
            sql.length,
            ['flink_job'],
        )
        assert.equal(state?.tableClauseComplete, true)
        assert.equal(state?.resolvedTable, 'flink_job')
    })

    it('FROM catalog.schema.table alias + whe → WHERE keyword slot', () => {
        const sql = 'SELECT * FROM hive.a003.test t whe'
        const state = analyzeFromJoinTableState(
            'from',
            sql,
            sql,
            sql.length,
            ['test'],
        )
        assert.equal(state?.clauseKeywordPrefix, 'whe')
        assert.equal(state?.tableClauseComplete, true)
        assert.equal(state?.resolvedTable, 'test')
    })

    it('qualified table without alias is complete for clause keywords', () => {
        const sql = 'SELECT * FROM hive.a003.test '
        const state = analyzeFromJoinTableState(
            'from',
            sql,
            sql.trimEnd(),
            sql.trimEnd().length,
            ['test'],
        )
        assert.equal(state?.tableClauseComplete, true)
        assert.equal(state?.resolvedTable, 'test')
    })
})
