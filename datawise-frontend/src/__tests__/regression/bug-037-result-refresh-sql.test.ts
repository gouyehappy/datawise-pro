import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {resolveExecutableSql} from '@/features/workspace/services/resolve-executable-sql'
import {
    replaceConsoleQueryResultAtIndex,
    resolveQueryResultRefreshRequest,
    resolveQueryResultRefreshSql,
    resolveStoredQuerySql,
} from '@/features/workspace/services/query-result-refresh.service'

describe('BUG-037: result refresh re-runs stored query sql', () => {
    it('resolveQueryResultRefreshSql returns trimmed result sql', () => {
        assert.equal(
            resolveQueryResultRefreshSql({sql: '  SELECT * FROM orders  '}),
            'SELECT * FROM orders',
        )
        assert.equal(resolveQueryResultRefreshSql(null), '')
    })

    it('resolveQueryResultRefreshRequest includes result tab index', () => {
        assert.deepEqual(
            resolveQueryResultRefreshRequest({sql: 'SELECT 1'}, 2),
            {sql: 'SELECT 1', resultIndex: 2},
        )
        assert.equal(resolveQueryResultRefreshRequest(null, 0), null)
    })

    it('refresh passes stored sql as executable override', () => {
        const storedSql = 'SELECT id, name FROM users WHERE status = 1'
        const refreshSql = resolveQueryResultRefreshSql({sql: storedSql})
        const resolved = resolveExecutableSql(refreshSql, () => 'SELECT 1', {
            fallbackToCurrentLineSql: () => 'SELECT only_first_line',
            fallbackToFullDocument: () => 'SELECT doc',
        })
        assert.equal(resolved.sql, storedSql)
    })

    it('replaceConsoleQueryResultAtIndex updates one tab and keeps activeView', () => {
        const before = {
            tab1: {
                activeView: 1 as const,
                results: [
                    {
                        id: 'a',
                        label: 'R1',
                        sql: 'SELECT 1',
                        columns: [],
                        rows: [],
                        total: 1,
                        durationMs: 10,
                        status: 'success' as const
                    },
                    {
                        id: 'b',
                        label: 'R2',
                        sql: 'SELECT 2',
                        columns: [],
                        rows: [],
                        total: 2,
                        durationMs: 20,
                        status: 'success' as const
                    },
                ],
            },
        }
        const after = replaceConsoleQueryResultAtIndex(before, 'tab1', 1, {
            id: 'new',
            label: 'ignored',
            sql: 'SELECT 2',
            columns: [{name: 'x', key: 'x'}],
            rows: [{x: 9}],
            total: 9,
            durationMs: 99,
            status: 'success',
        })
        assert.equal(after.tab1.results.length, 2)
        assert.equal(after.tab1.results[1].id, 'b')
        assert.equal(after.tab1.results[1].label, 'R2')
        assert.equal(after.tab1.results[1].total, 9)
        assert.equal(after.tab1.activeView, 1)
        assert.equal(after.tab1.results[0].total, 1)
    })

    it('resolveStoredQuerySql keeps full executed sql when API returns headline only', () => {
        const fullSql = 'SELECT id\nFROM users\nWHERE status = 1'
        assert.equal(resolveStoredQuerySql('SELECT id', fullSql), fullSql)
    })
})
