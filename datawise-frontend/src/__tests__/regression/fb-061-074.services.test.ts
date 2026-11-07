import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeDangerousSql, readCountFromPreviewRows} from '@/features/workspace/services/dangerous-sql-preview.service'
import {applySqlParameters, extractSqlParameters} from '@/features/workspace/services/sql-parameters.service'
import {buildResultDmlSql} from '@/features/workspace/services/result-dml.service'
import {formatSessionDuration, isActiveSession} from '@/features/workspace/services/active-sessions.service'
import {buildBlockingChains} from '@/features/workspace/services/lock-waits.service'
import {buildExplainIndexHints} from '@/features/workspace/services/explain-index-hints.service'
import {
    applyDatePresetToValues,
    detectDateParameterBinding,
    resolveDatePresetRange,
} from '@/features/workspace/services/sql-date-param-presets.service'
import {API_PATHS} from '@/shared/api/http/paths'
import type {TableColumn} from '@/core/types'

describe('FB-061 dangerous-sql-preview', () => {
    it('builds count preview for DELETE with WHERE', () => {
        const preview = analyzeDangerousSql('DELETE FROM orders WHERE status = 0')
        assert.equal(preview?.kind, 'delete')
        assert.match(preview?.countSql ?? '', /COUNT\(\*\).*orders.*status = 0/i)
    })

    it('skips INSERT statements', () => {
        assert.equal(analyzeDangerousSql('INSERT INTO t VALUES (1)'), null)
    })

    it('handles DELETE with table alias', () => {
        const preview = analyzeDangerousSql('DELETE FROM cdp_tag ct where ct.id = 15')
        assert.equal(preview?.fullTableRisk, false)
        assert.equal(preview?.whereClause, 'ct.id = 15')
        assert.match(preview?.countSql ?? '', /FROM cdp_tag ct WHERE ct\.id = 15/i)
    })

    it('reads count from preview rows', () => {
        assert.equal(readCountFromPreviewRows([{cnt: 42}]), 42)
    })

    it('ignores CREATE and ALTER statements', () => {
        assert.equal(analyzeDangerousSql('CREATE TABLE t (id INT)'), null)
        assert.equal(analyzeDangerousSql('ALTER TABLE t ADD COLUMN x INT'), null)
    })
})

describe('FB-062 sql-parameters', () => {
    it('extracts named and template parameters', () => {
        const names = extractSqlParameters('SELECT * FROM t WHERE id = :userId AND d >= ${startDate}')
        assert.deepEqual(names.sort(), ['startDate', 'userId'])
    })

    it('applies parameter values', () => {
        const sql = applySqlParameters(
            'SELECT * FROM t WHERE id = :userId AND n = ${count}',
            {userId: 'abc', count: '10'},
        )
        assert.match(sql, /'abc'/)
        assert.match(sql, /10/)
    })

    it('does not double-quote template params already wrapped in SQL quotes', () => {
        const sql = applySqlParameters(
            "WHERE created_at >= '${start_date}' AND created_at < '${end_date}'",
            {start_date: '2026-06-16', end_date: '2026-06-22'},
        )
        assert.match(sql, />= '2026-06-16'/)
        assert.match(sql, /< '2026-06-22'/)
        assert.doesNotMatch(sql, /''/)
    })

    it('does not double-quote named params already wrapped in SQL quotes', () => {
        const sql = applySqlParameters(
            "WHERE id = ':userId'",
            {userId: 'abc'},
        )
        assert.equal(sql, "WHERE id = 'abc'")
    })
})

describe('FB-067 result-dml', () => {
    const columns: TableColumn[] = [
        {name: 'id', key: 'id'},
        {name: 'name', key: 'name'},
    ]

    it('builds INSERT statements', () => {
        const sql = buildResultDmlSql('insert', columns, [{id: 1, name: 'a'}], 'users')
        assert.match(sql, /INSERT INTO users/)
        assert.match(sql, /'a'/)
    })

    it('builds UPDATE with primary key matched by column name', () => {
        const columns: TableColumn[] = [
            {name: 'tag_id', key: '0'},
            {name: 'tag_name', key: '1'},
            {name: 'user_count', key: '2'},
        ]
        const sql = buildResultDmlSql(
            'update',
            columns,
            [{0: 15, 1: '高价值用户', 2: 0}],
            'cdp_tag',
            ['tag_id'],
        )
        assert.match(sql, /UPDATE cdp_tag SET tag_name = '高价值用户', user_count = 0 WHERE tag_id = 15/)
    })

    it('builds DELETE with primary key matched by column name', () => {
        const columns: TableColumn[] = [
            {name: 'tag_id', key: '0'},
            {name: 'tag_name', key: '1'},
        ]
        const sql = buildResultDmlSql(
            'delete',
            columns,
            [{0: 15, 1: '高价值用户'}],
            'cdp_tag',
            ['tag_id'],
        )
        assert.match(sql, /DELETE FROM cdp_tag WHERE tag_id = 15/)
    })
})

describe('FB-079 active-sessions', () => {
    it('formats session duration', () => {
        assert.equal(formatSessionDuration(45), '45s')
        assert.equal(formatSessionDuration(125), '2m 5s')
    })

    it('detects active sessions', () => {
        assert.equal(isActiveSession({
            sessionId: '1',
            user: 'root',
            host: 'localhost',
            database: 'db',
            state: 'Sending data',
            command: 'Query',
            durationSeconds: 10,
            sql: 'SELECT 1',
        }), true)
        assert.equal(isActiveSession({
            sessionId: '2',
            user: 'root',
            host: 'localhost',
            database: 'db',
            state: 'idle',
            command: 'Sleep',
            durationSeconds: 0,
            sql: '',
        }), false)
    })
})

describe('FB-080 lock-waits', () => {
    it('builds blocking chains from edges', () => {
        const chains = buildBlockingChains([
            {
                waitingSessionId: '789',
                blockingSessionId: '456',
                waitSeconds: 8,
                waitingSql: 'UPDATE t SET x=1',
                blockingSql: 'UPDATE t SET x=2',
            },
            {
                waitingSessionId: '456',
                blockingSessionId: '123',
                waitSeconds: 15,
                waitingSql: 'UPDATE t SET x=2',
                blockingSql: 'SELECT * FROM t FOR UPDATE',
            },
        ])
        assert.equal(chains.length, 1)
        assert.equal(chains[0].sessionId, '123')
        assert.equal(chains[0].children.length, 1)
        assert.equal(chains[0].children[0].sessionId, '456')
        assert.equal(chains[0].children[0].children[0].sessionId, '789')
    })
})

describe('FB-081 session-kill', () => {
    it('builds kill session API path', () => {
        assert.match(API_PATHS.sql.killSession, /kill-session/)
    })
})

describe('FB-074 explain-index-hints', () => {
    it('warns on full table scan', () => {
        const hints = buildExplainIndexHints([
            {
                id: '1',
                label: 'orders (ALL)',
                metrics: {type: 'ALL', table: 'orders'},
            },
        ], 'mysql')
        assert.ok(hints.some((hint) => hint.severity === 'warning'))
    })
})

describe('FB-087 date-param-presets', () => {
    it('detects start/end date parameter pair', () => {
        const binding = detectDateParameterBinding(['startDate', 'endDate', 'userId'])
        assert.equal(binding?.startKey, 'startDate')
        assert.equal(binding?.endKey, 'endDate')
    })

    it('applies last 7 days preset to range parameters', () => {
        const binding = detectDateParameterBinding(['start_date', 'end_date'])
        assert.ok(binding)
        const values = applyDatePresetToValues('last7days', {}, binding!)
        assert.equal(values.start_date, resolveDatePresetRange('last7days').start)
        assert.equal(values.end_date, resolveDatePresetRange('last7days').end)
    })
})
