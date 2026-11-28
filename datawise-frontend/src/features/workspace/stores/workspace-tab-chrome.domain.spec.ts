import {describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import type {WorkspaceTabGroup} from '@/features/workspace/services/workspace-tab-layout.service'
import {createWorkspaceTabChromeDomain} from '@/features/workspace/stores/workspace-tab-chrome.domain'

function tab(partial: Partial<WorkspaceTab> & Pick<WorkspaceTab, 'id' | 'title' | 'type'>): WorkspaceTab {
    return {closable: true, ...partial}
}

function createChrome(options: {
    tabs: ReturnType<typeof ref<WorkspaceTab[]>>
    tabGroups?: ReturnType<typeof ref<WorkspaceTabGroup[]>>
    activeTabId?: ReturnType<typeof ref<string | null>>
    disposeCommunityWorkbenchTab?: ReturnType<typeof vi.fn>
    releaseOrphanedWorkbenchConnections?: ReturnType<typeof vi.fn>
    clearTabLocalState?: ReturnType<typeof vi.fn>
    cancelConsoleExecutionBestEffort?: ReturnType<typeof vi.fn>
}) {
    return createWorkspaceTabChromeDomain({
        tabs: options.tabs,
        tabGroups: options.tabGroups ?? ref([]),
        activeTabId: options.activeTabId ?? ref<string | null>(null),
        cancelConsoleExecutionBestEffort: options.cancelConsoleExecutionBestEffort ?? vi.fn(),
        clearTabLocalState: options.clearTabLocalState ?? vi.fn(),
        disposeSshTerminal: vi.fn(),
        disposeCommunityWorkbenchTab: options.disposeCommunityWorkbenchTab ?? vi.fn(),
        releaseOrphanedWorkbenchConnections: options.releaseOrphanedWorkbenchConnections ?? vi.fn(),
        resetConsoleQueryFb: vi.fn(),
        ensureConsoleQueryState: vi.fn(),
        hydrateDiskBackedTabIfNeeded: vi.fn(),
    })
}

describe('createWorkspaceTabChromeDomain', () => {
    it('closes a tab and clears local state', () => {
        const tabs = ref<WorkspaceTab[]>([
            tab({id: 'a', title: 'A', type: 'console'}),
            tab({id: 'b', title: 'B', type: 'console'}),
        ])
        const activeTabId = ref<string | null>('a')
        const clearTabLocalState = vi.fn()
        const cancelConsoleExecutionBestEffort = vi.fn()

        const chrome = createChrome({
            tabs,
            activeTabId,
            clearTabLocalState,
            cancelConsoleExecutionBestEffort,
        })

        chrome.closeTab('a')
        expect(tabs.value.map((t) => t.id)).toEqual(['b'])
        expect(activeTabId.value).toBe('b')
        expect(clearTabLocalState).toHaveBeenCalledWith('a')
        expect(cancelConsoleExecutionBestEffort).toHaveBeenCalledWith('a')
    })

    it('releases orphaned workbench connections when the last peer tab closes', () => {
        const tabs = ref<WorkspaceTab[]>([
            tab({
                id: 'wb1',
                title: 'Docker',
                type: 'community-workbench',
                connectionId: 'docker-1',
                pluginId: 'io.datawise.community.docker',
            }),
            tab({id: 'keep', title: 'Welcome', type: 'welcome', closable: false}),
        ])
        const releaseOrphanedWorkbenchConnections = vi.fn()
        const disposeCommunityWorkbenchTab = vi.fn()
        const chrome = createChrome({
            tabs,
            activeTabId: ref<string | null>('wb1'),
            disposeCommunityWorkbenchTab,
            releaseOrphanedWorkbenchConnections,
        })

        chrome.closeTab('wb1')
        expect(disposeCommunityWorkbenchTab).toHaveBeenCalled()
        expect(releaseOrphanedWorkbenchConnections).toHaveBeenCalledWith(['docker-1'])
    })

    it('does not release a connection while another tab still uses it', () => {
        const tabs = ref<WorkspaceTab[]>([
            tab({
                id: 'wb1',
                title: 'SSH-1',
                type: 'community-workbench',
                connectionId: 'ssh-1',
                pluginId: 'io.datawise.community.ssh',
            }),
            tab({
                id: 'wb2',
                title: 'SSH-2',
                type: 'community-workbench',
                connectionId: 'ssh-1',
                pluginId: 'io.datawise.community.ssh',
            }),
        ])
        const releaseOrphanedWorkbenchConnections = vi.fn()
        const chrome = createChrome({
            tabs,
            activeTabId: ref<string | null>('wb1'),
            releaseOrphanedWorkbenchConnections,
        })

        chrome.closeTab('wb1')
        expect(releaseOrphanedWorkbenchConnections).not.toHaveBeenCalled()
    })

    it('releases connections after closeOthers when peers are gone', () => {
        const tabs = ref<WorkspaceTab[]>([
            tab({
                id: 'wb1',
                title: 'Docker',
                type: 'community-workbench',
                connectionId: 'docker-1',
                pluginId: 'io.datawise.community.docker',
            }),
            tab({id: 'keep', title: 'Keep', type: 'welcome'}),
        ])
        const releaseOrphanedWorkbenchConnections = vi.fn()
        const chrome = createChrome({
            tabs,
            activeTabId: ref<string | null>('keep'),
            releaseOrphanedWorkbenchConnections,
        })

        chrome.closeOthers('keep')
        expect(releaseOrphanedWorkbenchConnections).toHaveBeenCalledWith(['docker-1'])
    })

    it('captureSession mirrors open tabs and groups', () => {
        const tabs = ref<WorkspaceTab[]>([tab({id: 't1', title: 'One', type: 'console', sql: 'select 1'})])
        const tabGroups = ref<WorkspaceTabGroup[]>([
            {id: 'g1', title: 'G', collapsed: false, titleCustom: true},
        ])
        const activeTabId = ref<string | null>('t1')
        const chrome = createChrome({tabs, tabGroups, activeTabId})

        const session = chrome.captureSession()
        expect(session.activeTabIndex).toBe(0)
        expect(session.tabGroups).toEqual([
            {id: 'g1', title: 'G', collapsed: false, titleCustom: true},
        ])
        expect(session.tabs).toHaveLength(1)
    })
})
