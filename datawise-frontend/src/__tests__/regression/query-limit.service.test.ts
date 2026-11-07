import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    DEFAULT_SQL_PAGE_SIZE,
    resolveClientMaxResultRowsFromBase,
    resolveCursorLoadedRowsMaxFrom,
    resolveSqlPageSizeFromMax,
} from '@/features/settings/services/query-limit-core'

describe('resolveSqlPageSizeFromMax', () => {
    it('keeps page size at DEFAULT even when maxResultRows is 5000', () => {
        assert.equal(resolveClientMaxResultRowsFromBase(5000), 5000)
        assert.equal(resolveSqlPageSizeFromMax(5000), DEFAULT_SQL_PAGE_SIZE)
        assert.equal(resolveSqlPageSizeFromMax(resolveClientMaxResultRowsFromBase(5000, true)), DEFAULT_SQL_PAGE_SIZE)
        assert.equal(DEFAULT_SQL_PAGE_SIZE, 500)
    })

    it('clamps page size when maxResultRows is below DEFAULT', () => {
        assert.equal(resolveSqlPageSizeFromMax(100), 100)
    })

    it('uses DEFAULT when maxResultRows is unlimited (0)', () => {
        assert.equal(resolveSqlPageSizeFromMax(0), DEFAULT_SQL_PAGE_SIZE)
    })
})

describe('resolveCursorLoadedRowsMaxFrom', () => {
    it('caps loaded window by maxResultRows', () => {
        assert.equal(resolveCursorLoadedRowsMaxFrom(1000), 1000)
    })

    it('keeps memory window when maxResultRows is unlimited', () => {
        assert.equal(resolveCursorLoadedRowsMaxFrom(0), 15_000)
    })
})
