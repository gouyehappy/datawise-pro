import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    layoutSpotlightTour,
    TOOLTIP_ESTIMATED_HEIGHT,
    TOOLTIP_WIDTH,
    VIEWPORT_MARGIN,
} from '../../features/onboarding/services/onboarding-spotlight.service.ts'

describe('onboarding spotlight layout', () => {
    it('centers tooltip when step has no target', () => {
        const layout = layoutSpotlightTour(undefined, 'center', TOOLTIP_WIDTH, TOOLTIP_ESTIMATED_HEIGHT, {
            width: 1280,
            height: 720,
        })
        assert.equal(layout.highlight, null)
        assert.equal(layout.arrowSide, 'none')
        assert.equal(layout.tooltip.width, TOOLTIP_WIDTH)
    })

    it('falls back to center when target is missing', () => {
        const layout = layoutSpotlightTour('missing-target', 'right', TOOLTIP_WIDTH, TOOLTIP_ESTIMATED_HEIGHT, {
            width: 1280,
            height: 720,
        })
        assert.equal(layout.highlight, null)
        assert.equal(layout.arrowSide, 'none')
    })

    it('keeps tooltip fully inside viewport for bottom-left targets', () => {
        const highlight = {top: 640, left: 8, width: 56, height: 56}
        const viewport = {width: 1280, height: 720}

        const originalDocument = globalThis.document
        globalThis.document = {
            querySelector: () => ({getBoundingClientRect: () => ({
                top: highlight.top + 10,
                left: highlight.left + 10,
                width: highlight.width - 20,
                height: highlight.height - 20,
            })}),
        } as unknown as Document

        try {
            const layout = layoutSpotlightTour('nav-terminal', 'top', TOOLTIP_WIDTH, TOOLTIP_ESTIMATED_HEIGHT, viewport)
            assert.ok(layout.tooltip.top >= VIEWPORT_MARGIN)
            assert.ok(layout.tooltip.top + layout.tooltip.height <= viewport.height - VIEWPORT_MARGIN)
            assert.ok(['top', 'left', 'right'].includes(layout.resolvedPlacement))
        } finally {
            globalThis.document = originalDocument
        }
    })
})
