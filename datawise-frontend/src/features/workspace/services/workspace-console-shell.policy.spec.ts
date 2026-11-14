import {describe, expect, it, beforeEach} from 'vitest'
import type {WorkspaceTab} from '@/core/types'
import {
    WORKSPACE_CONSOLE_SHELL_MAX,
    listConsoleTabs,
    resetConsoleShellFocusForTests,
    selectConsoleShellPersistIds,
    touchConsoleShellFocus,
} from '@/features/workspace/services/workspace-console-shell.policy'

function consoleTab(id: string): WorkspaceTab {
    return {
        id,
        title: id,
        type: 'console',
        closable: true,
    }
}

describe('workspace-console-shell.policy', () => {
    beforeEach(() => {
        resetConsoleShellFocusForTests()
    })

    it('exposes a positive soft cap', () => {
        expect(WORKSPACE_CONSOLE_SHELL_MAX).toBeGreaterThan(0)
    })

    it('lists only console tabs', () => {
        const tabs: WorkspaceTab[] = [
            consoleTab('c1'),
            {id: 't1', title: 't', type: 'table', closable: true},
            consoleTab('c2'),
        ]
        expect(listConsoleTabs(tabs).map((tab) => tab.id)).toEqual(['c1', 'c2'])
    })

    it('keeps most recently focused consoles within max', () => {
        const tabs = [consoleTab('a'), consoleTab('b'), consoleTab('c'), consoleTab('d')]
        touchConsoleShellFocus('a')
        touchConsoleShellFocus('b')
        touchConsoleShellFocus('c')
        touchConsoleShellFocus('d')
        const ids = selectConsoleShellPersistIds({
            tabs,
            protectIds: new Set(['d']),
            max: 2,
        })
        expect([...ids].sort()).toEqual(['c', 'd'])
    })

    it('never drops protected consoles even when over max', () => {
        const tabs = [consoleTab('a'), consoleTab('b'), consoleTab('c')]
        const ids = selectConsoleShellPersistIds({
            tabs,
            protectIds: new Set(['a', 'b', 'c']),
            max: 1,
        })
        expect([...ids].sort()).toEqual(['a', 'b', 'c'])
    })

    it('returns empty when no consoles', () => {
        const ids = selectConsoleShellPersistIds({
            tabs: [{id: 't1', title: 't', type: 'table', closable: true}],
            protectIds: new Set(['t1']),
            max: 8,
        })
        expect(ids.size).toBe(0)
    })
})
