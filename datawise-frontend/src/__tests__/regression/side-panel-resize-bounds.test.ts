import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    EXPLORER_PANEL_RESIZE_MIN,
    resolveSidePanelResizeMax,
    SHORTCUT_PANEL_RESIZE_MIN,
    SIDE_PANEL_CENTER_MIN_PX,
    SIDE_PANEL_CHROME_RESERVE_PX,
    SIDE_PANEL_RESIZE_MAX_PX,
} from '@/core/composables/useSidePanelResizeBounds'
import {normalizeLayout} from '@/shared/config/app-config.service'

describe('resolveSidePanelResizeMax', () => {
    it('caps by viewport ratio and absolute max on a large screen', () => {
        const max = resolveSidePanelResizeMax({
            viewportWidth: 2560,
            peerWidth: 0,
            min: EXPLORER_PANEL_RESIZE_MIN,
        })
        // min(960, 0.55*2560=1408, 2560-160-0-360=2040) = 960
        assert.equal(max, 960)
    })

    it('reserves center space when the peer panel is open at min window width', () => {
        const vw = 1100
        const peer = 280
        const max = resolveSidePanelResizeMax({
            viewportWidth: vw,
            peerWidth: peer,
            min: EXPLORER_PANEL_RESIZE_MIN,
        })
        const expected = Math.max(
            EXPLORER_PANEL_RESIZE_MIN,
            Math.round(Math.min(
                960,
                Math.round(vw * 0.55),
                vw - SIDE_PANEL_CHROME_RESERVE_PX - peer - SIDE_PANEL_CENTER_MIN_PX,
            )),
        )
        assert.equal(max, expected)
        assert.ok(max + peer + SIDE_PANEL_CHROME_RESERVE_PX + SIDE_PANEL_CENTER_MIN_PX <= vw)
    })

    it('never drops below the panel minimum even when the budget is tight', () => {
        const max = resolveSidePanelResizeMax({
            viewportWidth: 900,
            peerWidth: 400,
            min: SHORTCUT_PANEL_RESIZE_MIN,
        })
        assert.equal(max, SHORTCUT_PANEL_RESIZE_MIN)
    })

    it('ignores a zero peer (stripe-only / floated other side)', () => {
        const withPeer = resolveSidePanelResizeMax({
            viewportWidth: 1100,
            peerWidth: 280,
            min: EXPLORER_PANEL_RESIZE_MIN,
        })
        const withoutPeer = resolveSidePanelResizeMax({
            viewportWidth: 1100,
            peerWidth: 0,
            min: EXPLORER_PANEL_RESIZE_MIN,
        })
        assert.ok(withoutPeer > withPeer)
    })
})

describe('normalizeLayout side-panel width persistence', () => {
    it('keeps wide explorer/shortcut widths within live resize bounds (not the old 360/420 caps)', () => {
        const layout = normalizeLayout({
            explorerWidth: 520,
            shortcutPanelWidth: 600,
        })
        assert.equal(layout.explorerWidth, 520)
        assert.equal(layout.shortcutPanelWidth, 600)
    })

    it('clamps below panel mins and above absolute max', () => {
        const layout = normalizeLayout({
            explorerWidth: 40,
            shortcutPanelWidth: 2000,
        })
        assert.equal(layout.explorerWidth, EXPLORER_PANEL_RESIZE_MIN)
        assert.equal(layout.shortcutPanelWidth, SIDE_PANEL_RESIZE_MAX_PX)
    })
})
