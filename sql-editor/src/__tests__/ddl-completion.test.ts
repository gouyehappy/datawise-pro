import assert from 'node:assert'
import {describe, it} from 'node:test'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {analyzeCompletion} from '../completion/core/snapshot.ts'
import {detectDdlAwaitingColumnType} from '../completion/grammar/transitions/ddl.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'

const TABLES = ['customers', 'orders', 'users']

function at(sql: string, marker = '|') {
    const offset = sql.indexOf(marker)
    const clean = sql.replace(marker, '')
    const ctx = analyzeSqlCompletionContext(clean, offset, TABLES, {})
    const plan = resolveCompletionPlan(ctx)
    const snapshot = analyzeCompletion(clean, offset, TABLES, {}, analyzeSqlCompletionContext)
    return {ctx, plan, snapshot, clean}
}

describe('DDL completion stages', () => {
    it('ALTER TABLE 表后：ADD/DROP 等动作关键字', () => {
        const {plan} = at('ALTER TABLE users |')
        assert.equal(plan.stage, 'ddl.after_table')
        assert.equal(plan.keywordPhase, 'ddl-alter-next')
        assert.deepEqual(plan.collectors, ['keywords', 'snippets'])
    })

    it('DROP/ALTER/TRUNCATE pick existing tables without alias mode', () => {
        for (const sql of [
            'DROP TABLE IF EXISTS c',
            'ALTER TABLE u',
            'TRUNCATE TABLE o',
        ]) {
            const {plan} = at(`${sql}|`)
            assert.equal(plan.stage, 'ddl.pick_table')
            assert.equal(plan.tableInsertMode, 'name-only')
            assert.deepEqual(plan.collectors, ['tables'])
        }
    })

    it('CREATE TABLE body only suggests column types', () => {
        const {plan} = at('CREATE TABLE users (\n  id |')
        assert.equal(plan.stage, 'ddl.column_type')
        assert.deepEqual(plan.collectors, ['ddlTypes'])
    })

    it('CREATE TABLE name/paren positions suppress extra completions', () => {
        for (const sql of ['CREATE TABLE users |', 'CREATE TABLE users (|']) {
            const {plan} = at(sql)
            assert.equal(plan.stage, 'ddl.create_rest')
            assert.deepEqual(plan.collectors, [])
        }
    })

    it('ALTER ADD COLUMN type position suggests ddlTypes only', () => {
        const {plan} = at('ALTER TABLE users ADD COLUMN name |')
        assert.equal(plan.stage, 'ddl.column_type')
        assert.deepEqual(plan.collectors, ['ddlTypes'])
    })

    it('ALTER ADD COLUMN before name suppresses completions', () => {
        const {plan} = at('ALTER TABLE users ADD COLUMN |')
        assert.equal(plan.stage, 'ddl.create_rest')
        assert.deepEqual(plan.collectors, [])
    })
})

describe('detectDdlAwaitingColumnType', () => {
    it('detects type position inside CREATE TABLE', () => {
        assert.equal(detectDdlAwaitingColumnType('CREATE TABLE t ( id '), true)
        assert.equal(detectDdlAwaitingColumnType('CREATE TABLE t ( id INT, name '), true)
        assert.equal(detectDdlAwaitingColumnType('CREATE TABLE t ('), false)
        assert.equal(detectDdlAwaitingColumnType('CREATE TABLE t ( id INT, '), false)
        assert.equal(detectDdlAwaitingColumnType('CREATE TABLE t ( id'), false)
        assert.equal(detectDdlAwaitingColumnType('CREATE TABLE users '), false)
    })

    it('detects type position after ALTER ADD COLUMN', () => {
        assert.equal(detectDdlAwaitingColumnType('ALTER TABLE u ADD COLUMN foo '), true)
        assert.equal(detectDdlAwaitingColumnType('ALTER TABLE u ADD COLUMN '), false)
    })
})
