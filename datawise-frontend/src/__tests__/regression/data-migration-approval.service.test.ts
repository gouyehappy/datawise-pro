import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildDataMigrationApprovalSql,
    DATA_MIGRATION_APPROVAL_MARKER,
    isDataMigrationApprovalSql,
} from '@/features/explorer/services/data-migration-approval.service'
import {requiresWriteAccess} from '@/features/team/services/connection-access.service'
import {createDefaultTableMigrationForm} from '@/features/explorer/services/table-migration.pure'

describe('data-migration-approval.service', () => {
    it('builds a review-only plan that still counts as write SQL', () => {
        const form = createDefaultTableMigrationForm()
        form.mode = 'PK_UPSERT'
        form.conflictStrategy = 'SKIP'
        form.truncateTarget = false
        const sql = buildDataMigrationApprovalSql({
            sourceConnectionLabel: 'Dev',
            sourceDatabase: 'app',
            targetConnectionLabel: 'Prod',
            targetDatabase: 'app',
            form,
            tables: ['users', 'orders'],
        })
        assert.ok(sql.includes(DATA_MIGRATION_APPROVAL_MARKER))
        assert.ok(sql.includes('PK_UPSERT'))
        assert.ok(sql.includes('SKIP'))
        assert.ok(sql.includes('users'))
        assert.equal(isDataMigrationApprovalSql(sql), true)
        assert.equal(requiresWriteAccess(sql), true)
    })
})
