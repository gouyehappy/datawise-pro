import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    GRID_COLUMN_HYSTERESIS_PX,
    GRID_COLUMN_OVERSCAN_PX,
    GRID_COLUMN_VIRTUAL_THRESHOLD,
    isColumnWindowComfortable,
    mergeColumnVirtualWindow,
    resolveColumnVirtualWindow,
} from '@/core/data-grid/useGridColumnVirtualWindow'

describe('grid-column-virtual-window', () => {
    it('keeps a sensible threshold and overscan for smooth scrolling', () => {
        assert.ok(GRID_COLUMN_VIRTUAL_THRESHOLD >= 16)
        assert.ok(GRID_COLUMN_VIRTUAL_THRESHOLD <= 48)
        assert.ok(GRID_COLUMN_OVERSCAN_PX >= 400)
        assert.ok(GRID_COLUMN_HYSTERESIS_PX >= 120)
        assert.ok(GRID_COLUMN_HYSTERESIS_PX < GRID_COLUMN_OVERSCAN_PX)
    })

    it('returns full range below threshold', () => {
        const widths = Array.from({length: 10}, () => 100)
        const window = resolveColumnVirtualWindow({
            scrollableWidths: widths,
            scrollLeft: 0,
            viewportWidth: 800,
        })
        assert.equal(window.useVirtual, false)
        assert.equal(window.start, 0)
        assert.equal(window.end, 10)
        assert.equal(window.paddingLeftPx, 0)
        assert.equal(window.paddingRightPx, 0)
    })

    it('windows columns with pixel overscan and pads offscreen width', () => {
        const widths = Array.from({length: 40}, () => 100)
        const window = resolveColumnVirtualWindow({
            scrollableWidths: widths,
            scrollLeft: 1000,
            viewportWidth: 500,
            overscanPx: 200,
        })
        assert.equal(window.useVirtual, true)
        assert.equal(window.start, 8)
        assert.equal(window.end, 17)
        assert.equal(window.paddingLeftPx, 800)
        assert.equal(window.paddingRightPx, (40 - 17) * 100)
    })

    it('keeps the committed window while scroll stays inside hysteresis', () => {
        const widths = Array.from({length: 40}, () => 100)
        const committed = resolveColumnVirtualWindow({
            scrollableWidths: widths,
            scrollLeft: 1000,
            viewportWidth: 500,
            overscanPx: 600,
        })
        assert.equal(
            isColumnWindowComfortable({
                committed,
                scrollableWidths: widths,
                scrollLeft: 1050,
                viewportWidth: 500,
                hysteresisPx: 200,
            }),
            true,
        )
        assert.equal(
            isColumnWindowComfortable({
                committed,
                scrollableWidths: widths,
                scrollLeft: committed.paddingLeftPx + 10,
                viewportWidth: 500,
                hysteresisPx: 200,
            }),
            false,
        )
    })

    it('expands only while scrolling when shrink is disallowed', () => {
        const previous = {
            useVirtual: true,
            start: 10,
            end: 20,
            paddingLeftPx: 1000,
            paddingRightPx: 2000,
        }
        const next = {
            useVirtual: true,
            start: 12,
            end: 25,
            paddingLeftPx: 1200,
            paddingRightPx: 1500,
        }
        const merged = mergeColumnVirtualWindow(previous, next, false)
        assert.equal(merged.start, 10)
        assert.equal(merged.end, 25)
    })
})
