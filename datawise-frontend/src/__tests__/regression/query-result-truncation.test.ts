import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {isResultTruncatedAtCap} from '@/features/workspace/services/query-result-truncation'

describe('isResultTruncatedAtCap', () => {
    it('is true for hasMore without cursor', () => {
        assert.equal(isResultTruncatedAtCap({hasMore: true}), true)
        assert.equal(isResultTruncatedAtCap({hasMore: true, cursorId: ''}), true)
    })

    it('is false when cursor can load more or not truncated', () => {
        assert.equal(isResultTruncatedAtCap({hasMore: true, cursorId: 'c1'}), false)
        assert.equal(isResultTruncatedAtCap({hasMore: false}), false)
        assert.equal(isResultTruncatedAtCap(null), false)
    })
})
