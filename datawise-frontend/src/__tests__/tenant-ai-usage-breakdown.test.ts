import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {buildAiCapabilityUsageRows} from '@/features/ai/shared/services/tenant-ai-usage-breakdown'
import type {TenantAiUsage} from '@/shared/api/types'

const base: TenantAiUsage = {
    tenantId: 'default',
    day: '2026-08-01',
    calls: 5,
    limit: 100,
    remaining: 95,
    unlimited: false,
}

describe('tenant-ai-usage-breakdown', () => {
    it('orders known capabilities and skips empty unknown zeros', () => {
        const rows = buildAiCapabilityUsageRows({
            ...base,
            byCapability: {
                'ai.analyze': 2,
                'ai.chat': 3,
                'ai.sql.generate': 0,
            },
        })
        assert.deepEqual(
            rows.map((row) => row.id),
            ['ai.chat', 'ai.sql.generate', 'ai.analyze'],
        )
        assert.equal(rows[0]?.calls, 3)
        assert.equal(rows[1]?.calls, 0)
    })

    it('labels semantic / federated / canvas capabilities (Wave 33–34)', () => {
        const rows = buildAiCapabilityUsageRows({
            ...base,
            byCapability: {
                'ai.semantic.auto': 1,
                'ai.federated.sql': 2,
                'ai.canvas.rerun': 3,
            },
        })
        assert.deepEqual(
            rows.map((row) => [row.id, row.labelKey, row.calls]),
            [
                ['ai.semantic.auto', 'ai.quota.capSemanticAuto', 1],
                ['ai.federated.sql', 'ai.quota.capFederatedSql', 2],
                ['ai.canvas.rerun', 'ai.quota.capCanvasRerun', 3],
            ],
        )
    })

    it('appends unknown capability keys with positive counts', () => {
        const rows = buildAiCapabilityUsageRows({
            ...base,
            byCapability: {'ai.custom': 4},
        })
        assert.equal(rows.length, 1)
        assert.equal(rows[0]?.id, 'ai.custom')
        assert.equal(rows[0]?.labelKey, 'ai.quota.capOther')
    })

    it('returns empty when usage missing', () => {
        assert.deepEqual(buildAiCapabilityUsageRows(null), [])
    })
})
