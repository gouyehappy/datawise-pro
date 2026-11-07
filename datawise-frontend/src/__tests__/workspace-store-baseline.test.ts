import assert from 'node:assert/strict'
import {describe, it, beforeEach} from 'node:test'
import {createPinia, setActivePinia} from 'pinia'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import type {QueryResultItem} from '@/features/workspace/types/query-result'
import type {WorkspaceTab} from '@/core/types'

function result(id: string, label: string): QueryResultItem {
    return {
        id,
        label,
        sql: 'select 1',
        columns: [],
        rows: [],
        total: 0,
        durationMs: 0,
        status: 'success',
    }
}

function tab(id: string, overrides: Partial<WorkspaceTab> = {}): WorkspaceTab {
    return {
        id,
        title: id,
        type: 'console',
        closable: true,
        ...overrides,
    }
}

describe('workspace store baseline', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('setStatus updates message and keeps the rest of the snapshot', () => {
        const store = useWorkspaceStore()
        const before = {...store.status}
        store.setStatus('running')
        assert.equal(store.status.message, 'running')
        assert.equal(store.status.duration, before.duration)
        assert.equal(store.status.rowCount, before.rowCount)
    })

    it('updateTabSql writes new sql and ignores identical values', () => {
        const store = useWorkspaceStore()
        store.tabs.push(tab('t1', {sql: 'select 1'}))
        store.updateTabSql('t1', 'select 2')
        assert.equal(store.tabs[0]?.sql, 'select 2')
        store.updateTabSql('t1', 'select 2')
        assert.equal(store.tabs[0]?.sql, 'select 2')
        store.updateTabSql('missing', 'select 3')
        assert.equal(store.tabs[0]?.sql, 'select 2')
    })

    it('setConsoleQueryResults sets results and selects the last view', () => {
        const store = useWorkspaceStore()
        store.setConsoleQueryResults('t1', [result('r1', 'A'), result('r2', 'B'), result('r3', 'C')])
        assert.equal(store.consoleQueryByTabId.t1.results.length, 3)
        assert.equal(store.consoleQueryByTabId.t1.activeView, 2)

        store.setConsoleQueryResults('t2', [])
        assert.equal(store.consoleQueryByTabId.t2.results.length, 0)
        assert.equal(store.consoleQueryByTabId.t2.activeView, -1)
    })

    it('closeConsoleQueryResult re-targets the active view', () => {
        const store = useWorkspaceStore()
        store.setConsoleQueryResults('t1', [result('r1', 'A'), result('r2', 'B'), result('r3', 'C')])

        store.closeConsoleQueryResult('t1', 1)
        assert.deepEqual(store.consoleQueryByTabId.t1.results.map((item) => item.id), ['r1', 'r3'])
        assert.equal(store.consoleQueryByTabId.t1.activeView, 1)

        store.setConsoleQueryResults('t2', [result('r1', 'A'), result('r2', 'B'), result('r3', 'C')])
        store.closeConsoleQueryResult('t2', 0)
        assert.equal(store.consoleQueryByTabId.t2.activeView, 1)

        store.setConsoleQueryResults('t3', [result('r1', 'A')])
        store.closeConsoleQueryResult('t3', 0)
        assert.equal(store.consoleQueryByTabId.t3.results.length, 0)
        assert.equal(store.consoleQueryByTabId.t3.activeView, -1)
    })

    it('keeps only the target result when closing others', () => {
        const store = useWorkspaceStore()
        store.setConsoleQueryResults('t1', [result('r1', 'A'), result('r2', 'B'), result('r3', 'C')])
        store.closeOtherConsoleQueryResults('t1', 1)
        assert.deepEqual(store.consoleQueryByTabId.t1.results.map((item) => item.id), ['r2'])
        assert.equal(store.consoleQueryByTabId.t1.activeView, 0)
    })

    it('closes result tabs to the left and right with view correction', () => {
        const store = useWorkspaceStore()
        store.setConsoleQueryResults('t1', [result('r1', 'A'), result('r2', 'B'), result('r3', 'C')])
        store.closeConsoleQueryResultsToLeft('t1', 2)
        assert.deepEqual(store.consoleQueryByTabId.t1.results.map((item) => item.id), ['r3'])
        assert.equal(store.consoleQueryByTabId.t1.activeView, 0)

        store.setConsoleQueryResults('t2', [result('r1', 'A'), result('r2', 'B'), result('r3', 'C')])
        store.closeConsoleQueryResultsToRight('t2', 0)
        assert.deepEqual(store.consoleQueryByTabId.t2.results.map((item) => item.id), ['r1'])
        assert.equal(store.consoleQueryByTabId.t2.activeView, 0)
    })

    it('renameConsoleQueryResult trims, rejects blanks, and reports missing results', () => {
        const store = useWorkspaceStore()
        store.setConsoleQueryResults('t1', [result('r1', 'A')])
        assert.equal(store.renameConsoleQueryResult('t1', 0, '  New label  '), true)
        assert.equal(store.consoleQueryByTabId.t1.results[0]?.label, 'New label')
        assert.equal(store.renameConsoleQueryResult('t1', 0, '   '), false)
        assert.equal(store.renameConsoleQueryResult('t1', 9, 'X'), false)
    })

    it('closeAllConsoleQueryResults clears results and view', () => {
        const store = useWorkspaceStore()
        store.setConsoleQueryResults('t1', [result('r1', 'A'), result('r2', 'B')])
        store.closeAllConsoleQueryResults('t1')
        assert.equal(store.consoleQueryByTabId.t1.results.length, 0)
        assert.equal(store.consoleQueryByTabId.t1.activeView, -1)
    })

    it('getConsoleQueryState creates a stable empty state per tab', () => {
        const store = useWorkspaceStore()
        const state = store.getConsoleQueryState('t1')
        assert.deepEqual(state, {results: [], activeView: -1})
        assert.equal(store.getConsoleQueryState('t1'), state)
    })

    it('clampOpenTabFloatsToBounds keeps open floats inside a shrunk workspace body', () => {
        const store = useWorkspaceStore()
        store.tabs.push(tab('t1'), tab('t2'))
        store.floatTab('t1', {width: 1200, height: 800}, {x: 700, y: 100, width: 520, height: 360})
        store.floatTab('t2', {width: 1200, height: 800}, {x: 40, y: 40, width: 520, height: 360})
        store.toggleTabFloatMaximized('t2', {width: 1200, height: 800})
        assert.equal(store.getTabFloat('t2')?.maximized, true)

        const bounds = {width: 640, height: 400}
        store.clampOpenTabFloatsToBounds(bounds)

        const a = store.getTabFloat('t1')
        assert.ok(a)
        assert.ok(a.x >= 0)
        assert.ok(a.y >= 0)
        assert.ok(a.x + a.width <= bounds.width)
        // Title strip stays visible (clamp allows stored height to extend past the bottom).
        assert.ok(a.y + Math.min(a.height, 36) <= bounds.height)

        const b = store.getTabFloat('t2')
        assert.ok(b)
        assert.equal(b.maximized, true)
        assert.ok(b.width >= 600)
        assert.ok(b.height >= 360)
        assert.ok(b.x + b.width <= bounds.width)
        assert.ok(b.y + b.height <= bounds.height)
    })

    it('clampOpenTabFloatsToBounds leaves minimized floats alone', () => {
        const store = useWorkspaceStore()
        store.tabs.push(tab('t1'))
        store.floatTab('t1', {width: 1000, height: 700}, {x: 20, y: 20, width: 400, height: 300})
        store.toggleTabFloatMinimized('t1', {width: 1000, height: 700})
        const before = {...store.getTabFloat('t1')!}
        store.clampOpenTabFloatsToBounds({width: 500, height: 300})
        assert.deepEqual(store.getTabFloat('t1'), before)
    })
})
