import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {summarizeAuditEntryChanges} from '@/features/workspace/services/table-data-audit.service'
import type {TableDataChangeAuditEntry} from '@/shared/api/types'

describe('table-data-audit.service', () => {
    it('summarizes changed columns for UPDATE entries', () => {
        const entry: TableDataChangeAuditEntry = {
            id: 'audit-1',
            createdAtMs: 1,
            operation: 'UPDATE',
            beforeRow: {id: 1, name: 'Alice', status: 'A'},
            afterRow: {id: 1, name: 'Bob', status: 'A'},
            primaryKey: {id: 1},
            reverted: false,
        }
        assert.equal(summarizeAuditEntryChanges(entry), 'name')
    })

    it('truncates long UPDATE change lists', () => {
        const entry: TableDataChangeAuditEntry = {
            id: 'audit-2',
            createdAtMs: 1,
            operation: 'UPDATE',
            beforeRow: {a: 1, b: 1, c: 1, d: 1, e: 1},
            afterRow: {a: 2, b: 2, c: 2, d: 2, e: 2},
            primaryKey: {id: 1},
            reverted: false,
        }
        assert.match(summarizeAuditEntryChanges(entry), / \+2$/)
    })

    it('returns empty summary for non-UPDATE operations', () => {
        const entry: TableDataChangeAuditEntry = {
            id: 'audit-3',
            createdAtMs: 1,
            operation: 'DELETE',
            beforeRow: {id: 1},
            primaryKey: {id: 1},
            reverted: false,
        }
        assert.equal(summarizeAuditEntryChanges(entry), '')
    })
})
