import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    GOVERNANCE_DIFF_PREVIEW_LIMIT,
    isGovernancePreviewLimited,
    limitQueryResultDiffRows,
    limitSchemaCompareTableDiffs,
} from '@/features/pack/services/governance-diff-preview'
import type {TableSchemaDiff} from '@/features/schema-compare/types/schema-compare.types'
import type {QueryResultDiffView} from '@/features/workspace/services/query-result-diff.service'

function table(name: string, status: TableSchemaDiff['status']): TableSchemaDiff {
    return {tableName: name, status, columnDiffs: []}
}

describe('governance-diff-preview', () => {
    it('limits only when enforced without governance', () => {
        assert.equal(
            isGovernancePreviewLimited({mode: 'open', governanceUsable: false}),
            false,
        )
        assert.equal(
            isGovernancePreviewLimited({mode: 'enforced', governanceUsable: true}),
            false,
        )
        assert.equal(
            isGovernancePreviewLimited({mode: 'enforced', governanceUsable: false}),
            true,
        )
    })

    it('keeps all schema diffs under the conflict preview limit', () => {
        const diffs = Array.from({length: 10}, (_, i) => table(`t${i}`, 'changed'))
        const limited = limitSchemaCompareTableDiffs(diffs, true)
        assert.equal(limited.hiddenConflictCount, 0)
        assert.equal(limited.visible.length, 10)
    })

    it('hides overflow conflict tables and keeps unchanged', () => {
        const diffs: TableSchemaDiff[] = [
            ...Array.from({length: GOVERNANCE_DIFF_PREVIEW_LIMIT + 5}, (_, i) =>
                table(`c${i}`, 'changed'),
            ),
            table('same', 'unchanged'),
        ]
        const limited = limitSchemaCompareTableDiffs(diffs, true)
        assert.equal(limited.hiddenConflictCount, 5)
        assert.equal(
            limited.visible.filter((item) => item.status !== 'unchanged').length,
            GOVERNANCE_DIFF_PREVIEW_LIMIT,
        )
        assert.ok(limited.visible.some((item) => item.tableName === 'same'))
    })

    it('limits changed query-result rows', () => {
        const changedCount = GOVERNANCE_DIFF_PREVIEW_LIMIT + 4
        const diff: QueryResultDiffView = {
            baselineLabel: 'a',
            currentLabel: 'b',
            columns: [],
            rows: [
                ...Array.from({length: 2}, (_, i) => ({
                    id: `u${i}`,
                    rowStatus: 'unchanged' as const,
                    cells: {},
                })),
                ...Array.from({length: changedCount}, (_, i) => ({
                    id: `c${i}`,
                    rowStatus: 'modified' as const,
                    cells: {},
                })),
            ],
            summary: {
                unchangedRows: 2,
                modifiedRows: changedCount,
                addedRows: 0,
                removedRows: 0,
                changedCells: 0,
            },
        }
        const limited = limitQueryResultDiffRows(diff, true)
        assert.equal(limited.hiddenChangedCount, 4)
        assert.equal(
            limited.diff?.rows.filter((row) => row.rowStatus !== 'unchanged').length,
            GOVERNANCE_DIFF_PREVIEW_LIMIT,
        )
        assert.equal(
            limited.diff?.rows.filter((row) => row.rowStatus === 'unchanged').length,
            2,
        )
    })
})
