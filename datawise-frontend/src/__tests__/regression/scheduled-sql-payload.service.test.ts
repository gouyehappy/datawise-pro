import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildScheduledSqlPayloadJson,
    defaultScheduleNameForSqlFile,
    parseScheduledSqlPayloadJson,
} from '@/features/platform/services/scheduled-sql-payload.service'

describe('scheduled-sql-payload.service', () => {
    it('builds workspace file payload', () => {
        const json = buildScheduledSqlPayloadJson({
            source: 'workspace_file',
            connectionId: 'c1',
            database: 'app',
            sqlFile: 'nightly.sql',
        })
        assert.deepEqual(JSON.parse(json), {
            source: 'workspace_file',
            connectionId: 'c1',
            database: 'app',
            sqlFile: 'nightly.sql',
        })
    })

    it('builds query library payload', () => {
        const json = buildScheduledSqlPayloadJson({
            source: 'query_library',
            connectionId: 'c1',
            database: 'app',
            teamId: 't1',
            queryId: 'q1',
        })
        assert.equal(JSON.parse(json).queryId, 'q1')
    })

    it('infers source when parsing legacy payloads', () => {
        const parsed = parseScheduledSqlPayloadJson(
            '{"connectionId":"c1","database":"app","sqlFile":"a.sql"}',
        )
        assert.equal(parsed.source, 'workspace_file')
        assert.equal(parsed.sqlFile, 'a.sql')
    })

    it('names schedule from sql file', () => {
        assert.equal(defaultScheduleNameForSqlFile('nightly.sql'), 'Schedule nightly')
    })

    it('includes digestMaxRows when digest is enabled', () => {
        const json = buildScheduledSqlPayloadJson({
            source: 'inline',
            connectionId: 'c1',
            database: 'app',
            sql: 'select 1',
            digest: true,
            digestMaxRows: 35,
        })
        assert.deepEqual(JSON.parse(json), {
            source: 'inline',
            connectionId: 'c1',
            database: 'app',
            sql: 'select 1',
            digest: true,
            digestMaxRows: 35,
        })
        const parsed = parseScheduledSqlPayloadJson(json)
        assert.equal(parsed.digest, true)
        assert.equal(parsed.digestMaxRows, 35)
    })
})
