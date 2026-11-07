import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {WorkspaceTab} from '@/core/types'
import {isConsoleTabDirty} from '@/features/workspace/services/console-tab-dirty'

function consoleTab(partial: Partial<WorkspaceTab>): WorkspaceTab {
    return {
        id: 'console-1',
        title: 'Script 1',
        type: 'console',
        closable: true,
        sql: '',
        savedSql: '',
        ...partial,
    }
}

describe('BUG-010 console tab dirty state', () => {
    it('marks console tab dirty when sql differs from saved baseline', () => {
        const clean = consoleTab({sql: 'SELECT 1', savedSql: 'SELECT 1'})
        const dirty = consoleTab({sql: 'SELECT 2', savedSql: 'SELECT 1'})

        assert.equal(isConsoleTabDirty(clean), false)
        assert.equal(isConsoleTabDirty(dirty), true)
    })

    it('ignores non-console tabs', () => {
        assert.equal(
            isConsoleTabDirty({
                id: 'table-1',
                title: 'users',
                type: 'table',
                closable: true,
                sql: 'changed',
                savedSql: 'old',
            }),
            false,
        )
    })
})
