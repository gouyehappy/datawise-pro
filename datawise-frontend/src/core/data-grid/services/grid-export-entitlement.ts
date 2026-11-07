import type {TableRow} from '@/core/types'

/** §2.1 / §1.2 — free Standard grid export cap (Wave 37). */
export const FREE_GRID_EXPORT_MAX_ROWS = 100_000

export interface GridExportEntitlementSnapshot {
    mode: 'open' | 'enforced'
    suiteId?: string | null
    isSecurityUsable: boolean
}

/** Advanced export (full rows / masking) — Security pack or any commercial suite. */
export function hasAdvancedGridExportAccess(snapshot: GridExportEntitlementSnapshot): boolean {
    if (snapshot.mode === 'open') return true
    if (snapshot.isSecurityUsable) return true
    const suite = snapshot.suiteId
    return suite === 'suite.pro' || suite === 'suite.enterprise' || suite === 'suite.platform'
}

export interface FreeGridExportResolution {
    rows: TableRow[]
    capped: boolean
    limit: number
    total: number
}

/** Truncate to the free row cap when advanced export is not entitled. */
export function resolveFreeGridExportRows(
    rows: TableRow[],
    snapshot: GridExportEntitlementSnapshot,
): FreeGridExportResolution {
    const total = rows.length
    if (hasAdvancedGridExportAccess(snapshot) || total <= FREE_GRID_EXPORT_MAX_ROWS) {
        return {rows, capped: false, limit: FREE_GRID_EXPORT_MAX_ROWS, total}
    }
    return {
        rows: rows.slice(0, FREE_GRID_EXPORT_MAX_ROWS),
        capped: true,
        limit: FREE_GRID_EXPORT_MAX_ROWS,
        total,
    }
}
