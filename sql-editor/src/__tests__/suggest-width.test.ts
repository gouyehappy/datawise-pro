import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    SUGGEST_WIDTH_MAX,
    SUGGEST_WIDTH_MIN,
    clampSuggestWidgetWidth,
    estimateSuggestRowWidthPx,
} from '../completion/monaco/suggest-width-math.ts'

describe('suggest widget dynamic width', () => {
    it('clamps between min and max / viewport', () => {
        assert.equal(clampSuggestWidgetWidth(100), SUGGEST_WIDTH_MIN)
        assert.equal(clampSuggestWidgetWidth(9999, 2000), SUGGEST_WIDTH_MAX)
        assert.ok(clampSuggestWidgetWidth(400, 800) <= Math.floor(800 * 0.58))
    })

    it('long label + alias + badge needs more width than short keyword', () => {
        const short = estimateSuggestRowWidthPx({
            label: 'SELECT',
            description: 'KW',
            font: '500 12px monospace',
        })
        const long = estimateSuggestRowWidthPx({
            label: 'order_detail_history_archive',
            detail: '→ odha',
            description: 'TBL',
            font: '500 12px monospace',
        })
        assert.ok(long > short, `long=${long} short=${short}`)
        assert.ok(long > 220)
    })

    it('empty parts still reserve chrome', () => {
        const w = estimateSuggestRowWidthPx({})
        assert.ok(w >= 50)
    })
})
