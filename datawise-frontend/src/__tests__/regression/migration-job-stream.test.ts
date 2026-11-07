import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    consumeMigrationJobSseStreamForTest,
    encodeMigrationJobSseText,
} from '@/shared/api/http/migration-job-stream'

describe('migration-job-stream', () => {
    it('dispatches job_snapshot, batch_progress and job_done events', async () => {
        const sse = [
            'event: job_snapshot',
            'data: {"id":"job-1","status":"running","tablesPlanned":["users"],"tables":{},"results":[],"createdAt":"2026-06-01T00:00:00Z","updatedAt":"2026-06-01T00:00:01Z"}',
            '',
            'event: batch_progress',
            'data: {"tableIndex":1,"tableTotal":1,"tableName":"users","offset":500,"rowsMigrated":500,"batches":1}',
            '',
            'event: job_done',
            'data: {"id":"job-1","status":"completed","tablesPlanned":["users"],"tables":{},"results":[{"tableName":"users","rowsMigrated":500,"batches":1,"durationMs":10,"status":"success"}],"createdAt":"2026-06-01T00:00:00Z","updatedAt":"2026-06-01T00:00:02Z"}',
            '',
        ].join('\n')

        const snapshots: string[] = []
        const batches: string[] = []

        const outcome = await consumeMigrationJobSseStreamForTest(encodeMigrationJobSseText(sse), {
            onJobSnapshot: (view) => snapshots.push(view.status),
            onBatchProgress: (event) => batches.push(event.tableName),
            onJobDone: () => {},
        })

        assert.deepEqual(snapshots, ['running', 'completed'])
        assert.deepEqual(batches, ['users'])
        assert.equal(outcome.view.status, 'completed')
        assert.equal(outcome.results.length, 1)
    })

    it('returns paused view from job_paused event', async () => {
        const sse = [
            'event: job_snapshot',
            'data: {"id":"job-2","status":"running","tablesPlanned":["users"],"tables":{},"results":[],"createdAt":"2026-06-01T00:00:00Z","updatedAt":"2026-06-01T00:00:01Z"}',
            '',
            'event: job_paused',
            'data: {"id":"job-2","status":"paused","tablesPlanned":["users"],"tables":{},"results":[],"createdAt":"2026-06-01T00:00:00Z","updatedAt":"2026-06-01T00:00:02Z"}',
            '',
        ].join('\n')

        const outcome = await consumeMigrationJobSseStreamForTest(encodeMigrationJobSseText(sse), {})
        assert.equal(outcome.view.status, 'paused')
    })
})
