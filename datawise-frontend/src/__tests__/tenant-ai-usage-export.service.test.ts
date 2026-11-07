import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildTenantAiUsageExportFilename,
    formatTenantAiUsageCsv,
    formatTenantAiUsageJson,
} from '@/features/settings/services/tenant-ai-usage-export.service'
import type {TenantAiUsage} from '@/shared/api/types'

const sample: TenantAiUsage = {
    tenantId: 'default',
    day: '2026-07-19',
    calls: 42,
    limit: 100,
    remaining: 58,
    unlimited: false,
}

describe('tenant-ai-usage-export.service', () => {
    it('formats JSON with exportedAt', () => {
        const parsed = JSON.parse(formatTenantAiUsageJson(sample)) as {
            tenantId: string
            calls: number
            exportedAt: string
        }
        assert.equal(parsed.tenantId, 'default')
        assert.equal(parsed.calls, 42)
        assert.ok(parsed.exportedAt)
    })

    it('formats CSV with header row', () => {
        const csv = formatTenantAiUsageCsv(sample, new Date('2026-07-19T12:00:00.000Z'))
        assert.ok(csv.startsWith('tenantId,day,calls,limit,remaining,unlimited,byCapability,exportedAt\n'))
        assert.ok(csv.includes('default,2026-07-19,42,100,58,false,'))
    })

    it('builds export filename', () => {
        assert.match(
            buildTenantAiUsageExportFilename(sample, 'csv', new Date('2026-07-19T12:00:00.000Z')),
            /^ai-usage-default-2026-07-19-2026-07-19T12-00-00\.csv$/,
        )
    })
})
