import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    isProductionPerfActiveForConnection,
    isProductionConnectionNode,
    resolveEffectiveCursorLoadedRowsMax,
    resolveEffectiveMaxResultRows,
    PRODUCTION_PERF_CURSOR_MAX,
    PRODUCTION_PERF_MAX_RESULT_ROWS,
} from '@/features/settings/services/production-perf-mode.policy'
import {CURSOR_LOADED_ROWS_MAX} from '@/features/workspace/constants/query-result-limits'

describe('production-perf-mode.service', () => {
    it('detects production connections', () => {
        assert.equal(isProductionConnectionNode({env: 'prod'}), true)
        assert.equal(isProductionConnectionNode({env: 'dev'}), false)
    })

    it('caps max result rows for production perf mode', () => {
        assert.equal(resolveEffectiveMaxResultRows(5000, true), PRODUCTION_PERF_MAX_RESULT_ROWS)
        assert.equal(resolveEffectiveMaxResultRows(0, true), PRODUCTION_PERF_MAX_RESULT_ROWS)
        assert.equal(resolveEffectiveMaxResultRows(1000, true), 1000)
        assert.equal(resolveEffectiveMaxResultRows(5000, false), 5000)
    })

    it('caps cursor window for production perf mode', () => {
        assert.equal(resolveEffectiveCursorLoadedRowsMax(true), PRODUCTION_PERF_CURSOR_MAX)
        assert.equal(resolveEffectiveCursorLoadedRowsMax(false), CURSOR_LOADED_ROWS_MAX)
    })

    it('isProductionPerfActive requires setting and production connection', () => {
        const findProd = () => ({env: 'prod' as const})
        const findDev = () => ({env: 'dev' as const})
        assert.equal(isProductionPerfActiveForConnection('conn-1', findProd, true), true)
        assert.equal(isProductionPerfActiveForConnection('conn-1', findProd, false), false)
        assert.equal(isProductionPerfActiveForConnection('conn-1', findDev, true), false)
        assert.equal(isProductionPerfActiveForConnection(undefined, findProd, true), false)
    })
})
