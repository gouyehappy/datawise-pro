import type {TableSchemaDiff} from '@/features/schema-compare/types/schema-compare.types'
import {listConflictTableDiffs} from '@/features/schema-compare/services/schema-compare-selection.service'
import type {QueryResultDiffDisplayRow, QueryResultDiffView} from '@/features/workspace/services/query-result-diff.service'
import type {EntitlementMode} from '@/features/pack/types/pack.types'

/** §1.2 — free preview of governance diffs before unlock (Wave 37). */
export const GOVERNANCE_DIFF_PREVIEW_LIMIT = 20

export function isGovernancePreviewLimited(options: {
    mode: EntitlementMode
    governanceUsable: boolean
}): boolean {
    return options.mode === 'enforced' && !options.governanceUsable
}

/** Prefer conflict tables; fall back to all when filtering yields fewer. */
export function limitSchemaCompareTableDiffs(
    tableDiffs: readonly TableSchemaDiff[],
    limited: boolean,
    limit = GOVERNANCE_DIFF_PREVIEW_LIMIT,
): {visible: TableSchemaDiff[]; hiddenConflictCount: number} {
    if (!limited) {
        return {visible: [...tableDiffs], hiddenConflictCount: 0}
    }
    const conflicts = listConflictTableDiffs(tableDiffs)
    if (conflicts.length <= limit) {
        return {visible: [...tableDiffs], hiddenConflictCount: 0}
    }
    const keep = new Set(conflicts.slice(0, limit).map((item) => item.tableName))
    const visible = tableDiffs.filter(
        (item) => item.status === 'unchanged' || keep.has(item.tableName),
    )
    return {visible, hiddenConflictCount: conflicts.length - limit}
}

export function limitQueryResultDiffRows(
    diff: QueryResultDiffView | null | undefined,
    limited: boolean,
    limit = GOVERNANCE_DIFF_PREVIEW_LIMIT,
): {diff: QueryResultDiffView | null; hiddenChangedCount: number} {
    if (!diff) return {diff: null, hiddenChangedCount: 0}
    if (!limited) return {diff, hiddenChangedCount: 0}

    const changed = diff.rows.filter((row) => row.rowStatus !== 'unchanged')
    if (changed.length <= limit) return {diff, hiddenChangedCount: 0}

    const keepIds = new Set(changed.slice(0, limit).map((row) => row.id))
    const rows: QueryResultDiffDisplayRow[] = diff.rows.filter(
        (row) => row.rowStatus === 'unchanged' || keepIds.has(row.id),
    )
    return {
        diff: {...diff, rows},
        hiddenChangedCount: changed.length - limit,
    }
}
