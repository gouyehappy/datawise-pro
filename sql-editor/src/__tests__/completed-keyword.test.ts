import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    isKeywordCompleteBeforeCursor,
    shouldOfferKeywordAtCursor,
    lineEndsWithCompleteFrom,
} from '../completion/completed-keyword.ts'

describe('completed-keyword — suppress redundant suggestions', () => {
    it('完整 FROM 后不再提示 FROM', () => {
        assert.equal(lineEndsWithCompleteFrom('SELECT * FROM'), true)
        assert.equal(lineEndsWithCompleteFrom('SELECT * FROM '), true)
        assert.equal(shouldOfferKeywordAtCursor('SELECT * FROM', 'FROM', ''), false)
        assert.equal(shouldOfferKeywordAtCursor('SELECT\n*\nFROM', 'FROM', ''), false)
    })

    it('FROM 前缀仍提示 FROM', () => {
        assert.equal(shouldOfferKeywordAtCursor('SELECT * FRO', 'FROM', 'FRO'), true)
        assert.equal(lineEndsWithCompleteFrom('SELECT * FRO'), false)
    })

    it('完整 WHERE 后不再提示 WHERE', () => {
        assert.equal(isKeywordCompleteBeforeCursor('SELECT * FROM users WHERE', 'WHERE'), true)
        assert.equal(shouldOfferKeywordAtCursor('SELECT * FROM users WHERE ', 'WHERE', ''), false)
    })

    it('完整 ON 后不再提示 ON', () => {
        assert.equal(shouldOfferKeywordAtCursor('FROM a JOIN b ON ', 'ON', ''), false)
        assert.equal(shouldOfferKeywordAtCursor('FROM a JOIN b ON', 'ON', ''), false)
    })

    it('完整 GROUP BY / ORDER BY 后不再重复', () => {
        assert.equal(
            isKeywordCompleteBeforeCursor('SELECT * FROM t GROUP BY', 'GROUP BY'),
            true,
        )
        assert.equal(
            shouldOfferKeywordAtCursor('SELECT * FROM t ORDER BY ', 'ORDER BY', ''),
            false,
        )
        // 已进入列名区域：尾部判定不再拦截；由 keywordSlot 白名单去掉 GROUP BY
        assert.equal(
            isKeywordCompleteBeforeCursor('SELECT * FROM t GROUP BY status', 'GROUP BY'),
            false,
        )
    })

    it('完整 LEFT JOIN 后不再提示 LEFT JOIN', () => {
        assert.equal(
            shouldOfferKeywordAtCursor('FROM t1 LEFT JOIN ', 'LEFT JOIN', ''),
            false,
        )
        assert.equal(
            shouldOfferKeywordAtCursor('FROM t1 LEFT JOIN', 'LEFT JOIN', ''),
            false,
        )
    })

    it('同行更早的 LEFT JOIN 不阻止下一跳 LEFT JOIN', () => {
        assert.equal(
            shouldOfferKeywordAtCursor(
                'FROM t1 LEFT JOIN u ON t1.id = u.id ',
                'LEFT JOIN',
                '',
            ),
            true,
        )
    })

    it('JOIN 限定词前缀仍提示 LEFT JOIN', () => {
        assert.equal(shouldOfferKeywordAtCursor('FROM t1 left', 'LEFT JOIN', 'left'), true)
    })
})
