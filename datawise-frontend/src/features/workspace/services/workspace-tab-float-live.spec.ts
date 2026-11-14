import {describe, expect, it} from 'vitest'
import {clampTabFloatToBounds} from '@/features/workspace/services/workspace-tab-float.service'

/**
 * UX-01 regression: drag/resize commit path uses the same clamp as live preview,
 * so pointerup store writes stay within workspace bounds.
 */
describe('workspace tab float live commit (UX-01)', () => {
    it('clamps drag preview before store commit', () => {
        const bounds = {width: 800, height: 600}
        const next = clampTabFloatToBounds(
            {x: -40, y: 9999, width: 520, height: 360},
            bounds,
        )
        expect(next.x).toBe(0)
        expect(next.y).toBeGreaterThanOrEqual(0)
        expect(next.y + 36).toBeLessThanOrEqual(bounds.height)
        expect(next.width).toBeGreaterThanOrEqual(320)
    })
})
