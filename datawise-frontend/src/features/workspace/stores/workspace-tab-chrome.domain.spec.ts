import {describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import type {WorkspaceTabGroup} from '@/features/workspace/services/workspace-tab-layout.service'
import {createWorkspaceTabChromeDomain} from '@/features/workspace/stores/workspace-tab-chrome.domain'

function tab(partial: Partial<WorkspaceTab> & Pick<WorkspaceTab, 'id' | 'title' | 'type'>): WorkspaceTab {
    return {closable: true, ...partial}
}

describe('createWorkspaceTabChromeDomain', () => {
    it('closes a tab and clears local state', () => {
        const tabs = ref<WorkspaceTab[]>([
            tab({id: 'a', title: 'A', type: 'console'}),
            tab({id: 'b', title: 'B', type: 'console'}),
        ])
        const tabGroups = ref<WorkspaceTabGroup[]>([])
        const activeTabId = ref<string | null>('a')
        const clearTabLocalState = vi.fn()
        const cancelConsoleExecutionBestEffort = vi.fn()

        const chrome = createWorkspaceTabChromeDomain({
            tabs,
            tabGroups,
            activeTabId,
            cancelConsoleExecutionBestEffort,
            clearTabLocalState,
            disposeSshTerminal: vi.fn(),
            disposeCommunityWorkbenchTab: vi.fn(),
            resetConsoleQueryBag: vi.fn(),
            ensureConsoleQueryState: vi.fn(),
            hydrateDiskBackedTabIfNeeded: vi.fn(),
        })

        chrome.closeTab('a')
        expect(tabs.value.map((t) => t.id)).toEqual(['b'])
        expect(activeTabId.value).toBe('b')
        expect(clearTabLocalState).toHaveBeenCalledWith('a')
        expect(cancelConsoleExecutionBestEffort).toHaveBeenCalledWith('a')
    })

    it('captureSession mirrors open tabs and groups', () => {
        const tabs = ref<WorkspaceTab[]>([tab({id: 't1', title: 'One', type: 'console', sql: 'select 1'})])
        const tabGroups = ref<WorkspaceTabGroup[]>([
            {id: 'g1', title: 'G', collapsed: false, titleCustom: true},
        ])
        const activeTabId = ref<string | null>('t1')
        const chrome = createWorkspaceTabChromeDomain({
            tabs,
            tabGroups,
            activeTabId,
            cancelConsoleExecutionBestEffort: vi.fn(),
            clearTabLocalState: vi.fn(),
            disposeSshTerminal: vi.fn(),
            disposeCommunityWorkbenchTab: vi.fn(),
            resetConsoleQueryBag: vi.fn(),
            ensureConsoleQueryState: vi.fn(),
            hydrateDiskBackedTabIfNeeded: vi.fn(),
        })

        const session = chrome.captureSession()
        expect(session.activeTabIndex).toBe(0)
        expect(session.tabGroups).toEqual([
            {id: 'g1', title: 'G', collapsed: false, titleCustom: true},
        ])
        expect(session.tabs).toHaveLength(1)
    })
})
