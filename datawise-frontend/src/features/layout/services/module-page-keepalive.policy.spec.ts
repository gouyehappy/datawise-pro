import {describe, expect, it} from 'vitest'
import {MODULE_PAGE_KEEPALIVE_MAX} from '@/features/layout/services/module-page-keepalive.policy'

describe('module-page-keepalive.policy (PERF-06)', () => {
    it('keeps a small positive cache cap', () => {
        expect(MODULE_PAGE_KEEPALIVE_MAX).toBeGreaterThanOrEqual(1)
        expect(MODULE_PAGE_KEEPALIVE_MAX).toBeLessThanOrEqual(3)
    })
})
