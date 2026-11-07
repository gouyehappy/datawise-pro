import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    FREE_GRID_EXPORT_MAX_ROWS,
    hasAdvancedGridExportAccess,
    resolveFreeGridExportRows,
} from '@/features/workspace/data-grid/services/grid-export-entitlement'
import type {TableRow} from '@/core/types'

function rows(n: number): TableRow[] {
    return Array.from({length: n}, (_, i) => ({id: String(i)}))
}

describe('grid-export-entitlement', () => {
    it('allows full export in open mode', () => {
        assert.equal(
            hasAdvancedGridExportAccess({mode: 'open', isSecurityUsable: false}),
            true,
        )
        const many = rows(FREE_GRID_EXPORT_MAX_ROWS + 10)
        const resolved = resolveFreeGridExportRows(many, {
            mode: 'open',
            isSecurityUsable: false,
        })
        assert.equal(resolved.capped, false)
        assert.equal(resolved.rows.length, many.length)
    })

    it('caps enforced mode without security', () => {
        assert.equal(
            hasAdvancedGridExportAccess({mode: 'enforced', isSecurityUsable: false}),
            false,
        )
        const many = rows(FREE_GRID_EXPORT_MAX_ROWS + 5)
        const resolved = resolveFreeGridExportRows(many, {
            mode: 'enforced',
            isSecurityUsable: false,
        })
        assert.equal(resolved.capped, true)
        assert.equal(resolved.rows.length, FREE_GRID_EXPORT_MAX_ROWS)
        assert.equal(resolved.total, many.length)
    })

    it('unlocks with security pack or commercial suite', () => {
        assert.equal(
            hasAdvancedGridExportAccess({mode: 'enforced', isSecurityUsable: true}),
            true,
        )
        assert.equal(
            hasAdvancedGridExportAccess({
                mode: 'enforced',
                suiteId: 'suite.pro',
                isSecurityUsable: false,
            }),
            true,
        )
    })
})
