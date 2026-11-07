import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildSqlConflictPane,
    buildSqlLineDiff,
    summarizeSqlLineDiff,
} from '@/features/team/services/team-shared-query-diff.service'

describe('team-shared-query-diff.service', () => {
    it('builds line diff between local and remote SQL', () => {
        const rows = buildSqlLineDiff('SELECT 1\nFROM users', 'SELECT 1\nFROM orders')
        const summary = summarizeSqlLineDiff(rows)

        assert.equal(summary.added, 1)
        assert.equal(summary.removed, 1)
    })

    it('marks lines changed against the shared base', () => {
        const pane = buildSqlConflictPane('SELECT 1\nFROM users', 'SELECT 1\nFROM orders')

        assert.equal(pane[0]?.changed, false)
        assert.equal(pane[1]?.changed, true)
    })
})
