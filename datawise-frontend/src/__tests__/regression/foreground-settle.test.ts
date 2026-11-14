import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {shouldApplyViewportSample} from '@/shared/browser/foreground-settle'

describe('foreground-settle', () => {
    it('rejects transient zero-height samples after a stable viewport', () => {
        const previous = {scrollTop: 560, viewportHeight: 720}
        assert.equal(
            shouldApplyViewportSample({scrollTop: 0, viewportHeight: 0}, previous),
            false,
        )
        assert.equal(
            shouldApplyViewportSample({scrollTop: 560, viewportHeight: 0}, previous),
            false,
        )
        assert.equal(
            shouldApplyViewportSample(
                {scrollTop: 560, viewportHeight: 720},
                previous,
                {documentHidden: true},
            ),
            false,
        )
        assert.equal(
            shouldApplyViewportSample({scrollTop: 580, viewportHeight: 720}, previous),
            true,
        )
    })
})
