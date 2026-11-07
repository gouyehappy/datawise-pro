import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    findClosableTabIdsAfter,
    findClosableTabIdsBefore,
    findConsoleTabIdsForSqlFile,
    findOtherTabIds,
    findTableTabIds,
    resolveBulkCloseActiveTabId,
    resolveNextActiveTabIdAfterClose,
} from '@/features/workspace/services/workspace-tab-lifecycle.service'
import type {WorkspaceTab} from '@/core/types'

function tab(id: string, overrides: Partial<WorkspaceTab> = {}): WorkspaceTab {
    return {
        id,
        title: id,
        type: 'console',
        closable: true,
        ...overrides,
    }
}

const tabs: WorkspaceTab[] = [
    tab('c1', {type: 'console', connectionId: 'conn-1', sqlFile: 'a.sql'}),
    tab('c2', {type: 'console', connectionId: 'conn-1', sqlFile: 'a.sql', instanceId: 'ins-2'}),
    tab('t1', {type: 'table', tableName: 'users', connectionId: 'conn-1', database: 'app'}),
    tab('t2', {type: 'table', tableName: 'orders', connectionId: 'conn-2', database: 'app'}),
    tab('lock', {closable: false}),
]

describe('workspace-tab-lifecycle.service', () => {
    it('finds console tabs for a sql file and trims the file name', () => {
        const ids = findConsoleTabIdsForSqlFile(tabs, {connectionId: 'conn-1', fileName: ' a.sql '})
        assert.deepEqual(ids, ['c1', 'c2'])
        const scoped = findConsoleTabIdsForSqlFile(tabs, {
            connectionId: 'conn-1',
            instanceId: 'ins-2',
            fileName: 'a.sql',
        })
        assert.deepEqual(scoped, ['c2'])
        assert.deepEqual(findConsoleTabIdsForSqlFile(tabs, {connectionId: 'conn-1', fileName: '   '}), [])
    })

    it('finds table tabs by table, connection, and database', () => {
        assert.deepEqual(findTableTabIds(tabs, {tableName: 'users'}), ['t1'])
        assert.deepEqual(findTableTabIds(tabs, {tableName: 'orders', connectionId: 'conn-2', database: 'app'}), ['t2'])
        assert.deepEqual(findTableTabIds(tabs, {tableName: 'missing'}), [])
    })

    it('finds all other tab ids while keeping the target', () => {
        assert.deepEqual(findOtherTabIds(tabs, 'c1'), ['c2', 't1', 't2', 'lock'])
    })

    it('collects closable ids before and after a tab', () => {
        assert.deepEqual(findClosableTabIdsBefore(tabs, 't1'), ['c1', 'c2'])
        assert.deepEqual(findClosableTabIdsAfter(tabs, 't1'), ['t2'])
        assert.deepEqual(findClosableTabIdsBefore(tabs, 'c1'), [])
        assert.deepEqual(findClosableTabIdsAfter(tabs, 'lock'), [])
    })

    it('resolves the next active tab after close', () => {
        assert.equal(resolveNextActiveTabIdAfterClose(tabs, 2), 'c2')
        assert.equal(resolveNextActiveTabIdAfterClose(tabs, 0), 'c2')
        assert.equal(resolveNextActiveTabIdAfterClose([tab('only')], 0), null)
    })

    it('keeps the current active tab when it survives bulk close', () => {
        assert.equal(resolveBulkCloseActiveTabId([tab('c1'), tab('t1')], 't1', 'c1'), 'c1')
        assert.equal(resolveBulkCloseActiveTabId([tab('t1')], 't1', 'c1'), 't1')
    })
})
