import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    densityForWidth,
    estimateTitleBarContentWidth,
    pickTitleBarMenuDensity,
} from '@/features/layout/composables/useTitleBarMenuDensity'

const stats = {primaryCount: 6, contextItemCount: 7, contextGroupCount: 2}

describe('useTitleBarMenuDensity', () => {
    it('escalates compactness as menu width shrinks', () => {
        assert.equal(densityForWidth(1200), 'full')
        assert.equal(densityForWidth(950), 'ctx-compact')
        assert.equal(densityForWidth(700), 'ctx-overflow')
        assert.equal(densityForWidth(480), 'nav-compact')
    })

    it('estimates wider layout for full density than compact', () => {
        assert.ok(estimateTitleBarContentWidth('full', stats) > estimateTitleBarContentWidth('ctx-compact', stats))
        assert.ok(estimateTitleBarContentWidth('ctx-compact', stats) > estimateTitleBarContentWidth('ctx-overflow', stats))
    })

    it('picks less compact density when budget grows with hysteresis', () => {
        const tight = pickTitleBarMenuDensity(640, stats, 'full')
        assert.ok(['ctx-overflow', 'nav-compact'].includes(tight))

        const wide = pickTitleBarMenuDensity(1300, stats, 'ctx-overflow')
        assert.equal(wide, 'full')
    })
})
