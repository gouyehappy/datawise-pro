import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildKnowledgeDefinition,
    buildKnowledgeEntryFromSqlLog,
    buildKnowledgeTerm,
    buildTeamQueryPayloadFromSqlLog,
    extractTableNamesFromSql,
} from '@/features/workspace/services/sql-history-knowledge.utils'
import type {SqlLogEntry} from '@/core/types'

const sampleLog: SqlLogEntry = {
    id: 'log-1',
    sql: 'SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE u.status = 1',
    duration: '12ms',
    durationMs: 12,
    rows: 42,
    status: 'success',
    connectionId: 'conn-1',
    database: 'shop',
}

describe('sql-history-knowledge.service', () => {
    it('extracts table names from SQL keywords', () => {
        const tables = extractTableNamesFromSql(sampleLog.sql)
        assert.deepEqual([...tables].sort(), ['orders', 'users'])
    })

    it('builds a knowledge term from table names', () => {
        const tables = extractTableNamesFromSql(sampleLog.sql)
        assert.equal(buildKnowledgeTerm(sampleLog.sql, tables), 'SQL · users, orders')
    })

    it('builds definition with execution metadata', () => {
        const definition = buildKnowledgeDefinition(sampleLog)
        assert.match(definition, /SELECT u\.id/)
        assert.match(definition, /duration=12ms/)
        assert.match(definition, /rows=42/)
    })

    it('builds personal knowledge entry with connection and tables', () => {
        const entry = buildKnowledgeEntryFromSqlLog(sampleLog, {connectionName: 'Local MySQL'})
        assert.ok(entry)
        assert.equal(entry!.id, 'kb-sql-log-1')
        assert.equal(entry!.connectionId, 'conn-1')
        assert.equal(entry!.database, 'shop')
        assert.deepEqual(entry!.relatedTables?.sort(), ['orders', 'users'])
        assert.ok(entry!.synonyms?.includes('sql'))
    })

    it('builds team query payload with tags and connection metadata', () => {
        const payload = buildTeamQueryPayloadFromSqlLog(sampleLog, {
            connectionName: 'Local MySQL',
        })
        assert.equal(payload.connectionId, 'conn-1')
        assert.equal(payload.connectionName, 'Local MySQL')
        assert.equal(payload.database, 'shop')
        assert.ok(payload.tags?.includes('sql-history'))
        assert.ok(payload.tags?.includes('users'))
        assert.match(payload.sql, /SELECT u\.id/)
    })

    it('returns null when SQL is empty', () => {
        const entry = buildKnowledgeEntryFromSqlLog({...sampleLog, sql: '   '}, {})
        assert.equal(entry, null)
    })
})
