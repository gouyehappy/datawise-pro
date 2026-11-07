import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {computeSuggestDetailsTranslateY} from '../completion/monaco/suggest-details-offset.ts'

describe('suggest details vertical follow', () => {
    it('moves panel down when focused row is below details natural top', () => {
        const ty = computeSuggestDetailsTranslateY({
            detailsTop: 100,
            detailsHeight: 80,
            rowTop: 280,
            rowHeight: 22,
            arrowTop: 22,
            clampTop: 100,
            clampBottom: 800,
        })
        // row mid 291 → desired top 269 → ty 169
        assert.equal(ty, 269 - 100)
    })

    it('clamps so panel stays in viewport', () => {
        const ty = computeSuggestDetailsTranslateY({
            detailsTop: 100,
            detailsHeight: 80,
            rowTop: 760,
            rowHeight: 22,
            arrowTop: 22,
            clampTop: 8,
            clampBottom: 800,
        })
        // would want top ~749, but height 80 → max top 720
        assert.equal(ty, 720 - 100)
    })

    it('clamps above list top', () => {
        const ty = computeSuggestDetailsTranslateY({
            detailsTop: 200,
            detailsHeight: 80,
            rowTop: 200,
            rowHeight: 22,
            arrowTop: 22,
            clampTop: 200,
            clampBottom: 800,
        })
        // desired top = 200+11-22 = 189 → below clampTop 200 → ty 0
        assert.equal(ty, 0)
    })
})
