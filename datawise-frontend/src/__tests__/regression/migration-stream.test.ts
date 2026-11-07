import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    consumeMigrationSseStreamForTest,
    encodeMigrationSseText,
} from '@/shared/api/http/migration-stream'

describe('migration-stream', () => {
    it('dispatches table_start, table_result and done events', async () => {
        const sse = [
            'event: table_start',
            'data: {"tableIndex":1,"tableTotal":2,"tableName":"users"}',
            '',
            'event: table_result',
            'data: {"tableIndex":1,"tableTotal":2,"result":{"tableName":"users","rowsMigrated":1,"batches":1,"durationMs":10,"status":"success"}}',
            '',
            'event: table_start',
            'data: {"tableIndex":2,"tableTotal":2,"tableName":"orders"}',
            '',
            'event: table_result',
            'data: {"tableIndex":2,"tableTotal":2,"result":{"tableName":"orders","rowsMigrated":2,"batches":1,"durationMs":12,"status":"success"}}',
            '',
            'event: done',
            'data: {"results":[{"tableName":"users","rowsMigrated":1,"batches":1,"durationMs":10,"status":"success"},{"tableName":"orders","rowsMigrated":2,"batches":1,"durationMs":12,"status":"success"}]}',
            '',
        ].join('\n')

        const started: string[] = []
        const completed: string[] = []

        const result = await consumeMigrationSseStreamForTest(encodeMigrationSseText(sse), {
            onTableStart: (event) => started.push(event.tableName),
            onTableResult: (event) => completed.push(event.result.tableName),
            onDone: () => {},
        })

        assert.deepEqual(started, ['users', 'orders'])
        assert.deepEqual(completed, ['users', 'orders'])
        assert.equal(result.results.length, 2)
    })
})
