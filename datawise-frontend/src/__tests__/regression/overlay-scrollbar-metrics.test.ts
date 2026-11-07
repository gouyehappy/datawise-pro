import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    computeHorizontalThumb,
    computeVerticalThumb,
    overlayArmed,
    overlayNeedH,
    overlayNeedV,
    type OverlayScrollBox,
} from '@/core/composables/overlay-scrollbar-metrics'

function box(partial: Partial<OverlayScrollBox>): OverlayScrollBox {
    return {
        scrollTop: 0,
        scrollLeft: 0,
        clientH: 100,
        clientW: 100,
        scrollH: 100,
        scrollW: 100,
        ...partial,
    }
}

describe('overlay-scrollbar-metrics', () => {
    it('needV / needH require overflow beyond 1px slop', () => {
        assert.equal(overlayNeedV(box({scrollH: 100})), false)
        assert.equal(overlayNeedV(box({scrollH: 101})), false)
        assert.equal(overlayNeedV(box({scrollH: 102})), true)
        assert.equal(overlayNeedH(box({scrollW: 200})), true)
    })

    it('armed only when scrollable and sized', () => {
        assert.equal(overlayArmed(box({scrollH: 300})), true)
        assert.equal(overlayArmed(box({clientH: 0, scrollH: 300})), false)
        assert.equal(overlayArmed(box({scrollH: 100})), false)
    })

    it('vertical thumb scales and clamps to track', () => {
        const m = box({clientH: 100, scrollH: 400, scrollTop: 0})
        const t = computeVerticalThumb(m)
        assert.equal(t.height, 25)
        assert.equal(t.top, 0)
        assert.equal(t.maxScroll, 300)

        const mid = computeVerticalThumb({...m, scrollTop: 150})
        assert.ok(Math.abs(mid.top - 37.5) < 0.01)
    })

    it('horizontal thumb shortens track when vertical rail present', () => {
        const both = box({clientH: 100, scrollH: 200, clientW: 100, scrollW: 200})
        const t = computeHorizontalThumb(both)
        assert.equal(t.track, 96)
        assert.ok(t.width <= t.track)
    })
})
