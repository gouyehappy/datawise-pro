import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    DEFAULT_SLOW_QUERY_THRESHOLD_MS,
    filterSlowSqlLogs,
    isSlowDurationMs,
    isSlowSqlLog,
    parseLogDurationMs,
} from '@/features/workspace/services/slow-query.utils'
import type {SqlLogEntry} from '@/core/types'

describe('slow-query.service', () => {
    it('parseLogDurationMs prefers durationMs field', () => {
        assert.equal(parseLogDurationMs({duration: '10ms', durationMs: 4200}), 4200)
    })

    it('parseLogDurationMs parses duration string fallback', () => {
        assert.equal(parseLogDurationMs({duration: '1500ms'}), 1500)
        assert.equal(parseLogDurationMs({duration: '—'}), 0)
    })

    it('isSlowDurationMs uses threshold inclusive', () => {
        assert.equal(isSlowDurationMs(2999, 3000), false)
        assert.equal(isSlowDurationMs(3000, 3000), true)
        assert.equal(isSlowDurationMs(5000, 3000), true)
    })

    it('isSlowSqlLog evaluates parsed duration', () => {
        const log: Pick<SqlLogEntry, 'duration' | 'durationMs'> = {duration: '3200ms', durationMs: 3200}
        assert.equal(isSlowSqlLog(log, DEFAULT_SLOW_QUERY_THRESHOLD_MS), true)
    })

    it('filterSlowSqlLogs keeps only slow entries', () => {
        const logs: SqlLogEntry[] = [
            {id: '1', sql: 'fast', time: '12:00', duration: '50ms', durationMs: 50, status: 'success'},
            {id: '2', sql: 'slow', time: '12:01', duration: '4000ms', durationMs: 4000, status: 'success'},
        ]
        const filtered = filterSlowSqlLogs(logs, 3000)
        assert.equal(filtered.length, 1)
        assert.equal(filtered[0]?.id, '2')
    })
})
