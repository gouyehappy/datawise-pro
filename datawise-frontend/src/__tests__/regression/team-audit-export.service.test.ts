import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {TeamAuditLog} from '@/core/types'
import {
    extractSqlFromAuditDetail,
    formatAuditDetailForExport,
    serializeAuditLogsToCsv,
    serializeAuditLogsToJson,
} from '@/features/team/services/team-audit-export.service'

const sampleLog: TeamAuditLog = {
    id: 'ta-1',
    actorUserId: 7,
    actorUserName: 'alice',
    action: 'sql.dangerous',
    detail: 'connectionId=conn-1; database=shop | sql:DELETE FROM orders WHERE id = 1',
    createdAt: '2026-06-15 10:00:00',
}

describe('team-audit-export.service', () => {
    it('extracts sql marker from audit detail', () => {
        assert.equal(
            extractSqlFromAuditDetail(sampleLog.detail),
            'DELETE FROM orders WHERE id = 1',
        )
    })

    it('truncates detail when full sql disabled', () => {
        const longDetail = `connectionId=conn-1 | sql:${'x'.repeat(200)}`
        assert.equal(formatAuditDetailForExport(longDetail, false).endsWith('…'), true)
        assert.equal(formatAuditDetailForExport(longDetail, true), longDetail)
    })

    it('serializes csv and json exports', () => {
        const csv = serializeAuditLogsToCsv([sampleLog], {includeFullSql: true})
        assert.match(csv, /sql\.dangerous/)
        assert.match(csv, /DELETE FROM orders/)

        const json = serializeAuditLogsToJson([sampleLog], {includeFullSql: false})
        const parsed = JSON.parse(json) as Array<{detail: string; sql?: string}>
        assert.equal(parsed[0]?.sql, undefined)
        assert.match(parsed[0]?.detail ?? '', /connectionId=conn-1/)
    })
})
