import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    isTenantAiQuotaExhausted,
    isTenantAiQuotaNearLimit,
} from '@/features/ai/shared/services/tenant-ai-quota.service'
import type {TenantAiUsage} from '@/shared/api/types'

function usage(partial: Partial<TenantAiUsage> & Pick<TenantAiUsage, 'calls' | 'limit' | 'remaining'>): TenantAiUsage {
    return {
        tenantId: 'default',
        day: '2026-07-19',
        unlimited: false,
        ...partial,
    }
}

describe('tenant-ai-quota.service', () => {
    it('isTenantAiQuotaNearLimit at 10% remaining', () => {
        assert.equal(isTenantAiQuotaNearLimit(usage({calls: 90, limit: 100, remaining: 10})), true)
        assert.equal(isTenantAiQuotaNearLimit(usage({calls: 91, limit: 100, remaining: 9})), true)
        assert.equal(isTenantAiQuotaNearLimit(usage({calls: 80, limit: 100, remaining: 20})), false)
    })

    it('isTenantAiQuotaNearLimit at ≤5 remaining regardless of limit', () => {
        assert.equal(isTenantAiQuotaNearLimit(usage({calls: 95, limit: 1000, remaining: 5})), true)
        assert.equal(isTenantAiQuotaNearLimit(usage({calls: 996, limit: 1000, remaining: 4})), true)
        assert.equal(isTenantAiQuotaNearLimit(usage({calls: 899, limit: 1000, remaining: 101})), false)
    })

    it('isTenantAiQuotaNearLimit ignores unlimited, zero limit, and exhausted', () => {
        assert.equal(isTenantAiQuotaNearLimit(usage({calls: 999, limit: 1000, remaining: 1, unlimited: true})), false)
        assert.equal(isTenantAiQuotaNearLimit(usage({calls: 0, limit: 0, remaining: 0})), false)
        assert.equal(isTenantAiQuotaNearLimit(usage({calls: 100, limit: 100, remaining: 0})), false)
        assert.equal(isTenantAiQuotaNearLimit(null), false)
    })

    it('isTenantAiQuotaExhausted only when capped and remaining is zero', () => {
        assert.equal(isTenantAiQuotaExhausted(usage({calls: 100, limit: 100, remaining: 0})), true)
        assert.equal(isTenantAiQuotaExhausted(usage({calls: 100, limit: 100, remaining: 1})), false)
        assert.equal(isTenantAiQuotaExhausted(usage({calls: 100, limit: 100, remaining: 0, unlimited: true})), false)
        assert.equal(isTenantAiQuotaExhausted(null), false)
    })
})
