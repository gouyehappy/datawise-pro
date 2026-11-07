/**
 * Workspace tab chrome domain (A-12 knife 2): close lifecycle, tab groups, session restore/capture.
 * Factory over shared refs — `useWorkspaceStore` remains the public facade.
 */
import type {Ref} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import type {WorkspaceTabSnapshot} from '@/shared/config/app-config.types'
import {
    buildWorkspaceTabsFromSnapshots,
    captureWorkspaceTabs,
    resolveRestoredActiveTabId,
} from '@/features/workspace/utils/workspace-session'
import {
    clearOrphanTabGroupIds,
    defaultGroupTitle,
    dissolveTabGroup,
    ejectTabByDrop,
    mergeTabsByDrop,
    pruneEmptyTabGroups,
    reorderTabByDrop,
    stripGroupTitleCount,
    type WorkspaceTabGroup,
} from '@/features/workspace/services/workspace-tab-layout.service'
import {
    findClosableTabIdsAfter,
    findClosableTabIdsBefore,
    findConsoleTabIdsForSqlFile,
    findOtherTabIds,
    findTableTabIds,
    resolveBulkCloseActiveTabId,
    resolveNextActiveTabIdAfterClose,
} from '@/features/workspace/services/workspace-tab-lifecycle.service'
import {
    nextWorkspaceTabId,
    workspaceTabIdPrefix,
} from '@/features/workspace/services/workspace-tab-id'
import {t} from '@/i18n'

export type WorkspaceTabChromeDomainDeps = {
    tabs: Ref<WorkspaceTab[]>
    tabGroups: Ref<WorkspaceTabGroup[]>
    activeTabId: Ref<string | null>
    cancelConsoleExecutionBestEffort: (tabId: string) => void
    clearTabLocalState: (tabId: string) => void
    disposeSshTerminal: (tabId: string) => void
    disposeCommunityWorkbenchTab: (tab: WorkspaceTab) => void
    resetConsoleQueryBag: () => void
    ensureConsoleQueryState: (tabId: string) => void
    hydrateDiskBackedTabIfNeeded: (tabId: string) => void | Promise<void>
}

export function createWorkspaceTabChromeDomain(deps: WorkspaceTabChromeDomainDeps) {
    function normalizeTabGroups() {
        deps.tabGroups.value = pruneEmptyTabGroups(deps.tabs.value, deps.tabGroups.value)
        deps.tabs.value = clearOrphanTabGroupIds(deps.tabs.value, deps.tabGroups.value)
    }

    function disposeTabSideEffects(tab: WorkspaceTab | undefined, tabId: string) {
        if (tab?.type === 'ssh-terminal') {
            deps.disposeSshTerminal(tabId)
        }
        if (tab?.type === 'community-workbench') {
            deps.disposeCommunityWorkbenchTab(tab)
        }
        if (tab?.type === 'console') {
            deps.cancelConsoleExecutionBestEffort(tabId)
        }
    }

    function closeTab(tabId: string) {
        const tab = deps.tabs.value.find((t) => t.id === tabId)
        if (!tab?.closable) return
        const idx = deps.tabs.value.findIndex((t) => t.id === tabId)
        const nextActive = resolveNextActiveTabIdAfterClose(deps.tabs.value, idx)
        disposeTabSideEffects(tab, tabId)
        deps.tabs.value.splice(idx, 1)
        deps.tabGroups.value = pruneEmptyTabGroups(deps.tabs.value, deps.tabGroups.value)
        deps.tabs.value = clearOrphanTabGroupIds(deps.tabs.value, deps.tabGroups.value)
        deps.clearTabLocalState(tabId)
        if (deps.activeTabId.value === tabId) {
            deps.activeTabId.value = nextActive
        }
    }

    function closeConsoleTabsForSqlFile(options: {
        connectionId: string
        instanceId?: string | null
        fileName: string
    }) {
        const fileName = options.fileName.trim()
        if (!fileName) return
        for (const tabId of findConsoleTabIdsForSqlFile(deps.tabs.value, options)) {
            closeTab(tabId)
        }
    }

    function closeTableTabs(options: {
        connectionId?: string
        database?: string
        tableName: string
    }) {
        const tableName = options.tableName.trim()
        if (!tableName) return
        for (const tabId of findTableTabIds(deps.tabs.value, options)) {
            closeTab(tabId)
        }
    }

    function closeOthers(tabId: string) {
        const removeIds = findOtherTabIds(deps.tabs.value, tabId)
        for (const id of removeIds) {
            const tab = deps.tabs.value.find((t) => t.id === id)
            disposeTabSideEffects(tab, id)
            deps.clearTabLocalState(id)
        }
        deps.tabs.value = deps.tabs.value.filter((t) => t.id === tabId)
        deps.tabGroups.value = []
        deps.activeTabId.value = tabId
    }

    function closeTabsToLeft(tabId: string) {
        const idx = deps.tabs.value.findIndex((t) => t.id === tabId)
        if (idx <= 0) return
        for (const id of findClosableTabIdsBefore(deps.tabs.value, tabId)) {
            closeTab(id)
        }
        deps.activeTabId.value = resolveBulkCloseActiveTabId(
            deps.tabs.value,
            tabId,
            deps.activeTabId.value,
        )
    }

    function closeTabsToRight(tabId: string) {
        const idx = deps.tabs.value.findIndex((t) => t.id === tabId)
        if (idx < 0 || idx >= deps.tabs.value.length - 1) return
        for (const id of findClosableTabIdsAfter(deps.tabs.value, tabId)) {
            closeTab(id)
        }
        deps.activeTabId.value = resolveBulkCloseActiveTabId(
            deps.tabs.value,
            tabId,
            deps.activeTabId.value,
        )
    }

    function closeAllClosable() {
        const allIds = deps.tabs.value.map((t) => t.id)
        for (const id of allIds) {
            const tab = deps.tabs.value.find((t) => t.id === id)
            if (tab?.type === 'console') {
                deps.cancelConsoleExecutionBestEffort(id)
            }
            if (tab?.type === 'ssh-terminal') {
                deps.disposeSshTerminal(id)
            }
            deps.clearTabLocalState(id)
        }
        deps.tabs.value = []
        deps.tabGroups.value = []
        deps.activeTabId.value = null
    }

    function getTabTitle(tabId: string) {
        return deps.tabs.value.find((t) => t.id === tabId)?.title ?? ''
    }

    function renameTab(tabId: string, title: string) {
        const tab = deps.tabs.value.find((t) => t.id === tabId)
        if (!tab) return false
        const next = title.trim()
        if (!next) return false
        tab.title = next
        return true
    }

    function dropTab(draggedId: string, targetId: string | null, zone: 'before' | 'on' | 'after' | 'end') {
        if (!draggedId) return
        if (zone === 'end') {
            deps.tabs.value = ejectTabByDrop(deps.tabs.value, draggedId, targetId, 'end')
            normalizeTabGroups()
            return
        }
        if (!targetId || draggedId === targetId) return
        if (zone === 'on') {
            const involved = deps.tabs.value.filter((tab) => tab.id === draggedId || tab.id === targetId)
            const title = defaultGroupTitle(
                [
                    ...involved,
                    ...deps.tabs.value.filter(
                        (tab) =>
                            tab.tabGroupId
                            && (tab.tabGroupId === deps.tabs.value.find((t) => t.id === targetId)?.tabGroupId)
                            && tab.id !== draggedId
                            && tab.id !== targetId,
                    ),
                ],
                t('workspace.tabGroupDefault'),
            )
            const result = mergeTabsByDrop(
                deps.tabs.value,
                deps.tabGroups.value,
                draggedId,
                targetId,
                () => nextWorkspaceTabId('tab-group'),
                title,
            )
            const gid = result.tabs.find((tab) => tab.id === targetId)?.tabGroupId
            if (gid) {
                const members = result.tabs.filter((tab) => tab.tabGroupId === gid)
                result.groups = result.groups.map((group) => {
                    if (group.id !== gid || group.titleCustom) return group
                    return {...group, title: defaultGroupTitle(members, title)}
                })
            }
            deps.tabs.value = result.tabs
            deps.tabGroups.value = result.groups
            normalizeTabGroups()
            return
        }
        deps.tabs.value = reorderTabByDrop(deps.tabs.value, draggedId, targetId, zone)
        normalizeTabGroups()
    }

    function toggleTabGroupCollapsed(groupId: string) {
        const group = deps.tabGroups.value.find((item) => item.id === groupId)
        if (!group) return
        group.collapsed = !group.collapsed
    }

    function renameTabGroup(groupId: string, title: string) {
        const group = deps.tabGroups.value.find((item) => item.id === groupId)
        if (!group) return false
        const next = stripGroupTitleCount(title)
        if (!next) return false
        group.title = next
        group.titleCustom = true
        return true
    }

    function dissolveTabGroupById(groupId: string) {
        const result = dissolveTabGroup(deps.tabs.value, deps.tabGroups.value, groupId)
        deps.tabs.value = result.tabs
        deps.tabGroups.value = result.groups
    }

    function restoreSession(
        snapshots: WorkspaceTabSnapshot[],
        activeTabIndex = 0,
        groups: WorkspaceTabGroup[] = [],
    ) {
        if (!snapshots.length) {
            deps.tabs.value = []
            deps.tabGroups.value = []
            deps.activeTabId.value = null
            return
        }

        const restored = buildWorkspaceTabsFromSnapshots(
            snapshots,
            nextWorkspaceTabId,
            workspaceTabIdPrefix,
        )
        deps.tabs.value = restored
        deps.tabGroups.value = groups.slice()
        normalizeTabGroups()
        deps.resetConsoleQueryBag()
        for (const tab of restored) {
            if (tab.type === 'console') deps.ensureConsoleQueryState(tab.id)
        }
        deps.activeTabId.value = resolveRestoredActiveTabId(restored, activeTabIndex)
        if (deps.activeTabId.value) void deps.hydrateDiskBackedTabIfNeeded(deps.activeTabId.value)
    }

    function captureSession() {
        return {
            tabs: captureWorkspaceTabs(deps.tabs.value),
            activeTabIndex: deps.tabs.value.findIndex((tab) => tab.id === deps.activeTabId.value),
            tabGroups: deps.tabGroups.value.map((group) => ({
                id: group.id,
                title: group.title,
                collapsed: group.collapsed,
                titleCustom: group.titleCustom,
            })),
        }
    }

    return {
        normalizeTabGroups,
        closeTab,
        closeConsoleTabsForSqlFile,
        closeTableTabs,
        closeOthers,
        closeTabsToLeft,
        closeTabsToRight,
        closeAllClosable,
        getTabTitle,
        renameTab,
        dropTab,
        toggleTabGroupCollapsed,
        renameTabGroup,
        dissolveTabGroupById,
        restoreSession,
        captureSession,
    }
}

export type WorkspaceTabChromeDomain = ReturnType<typeof createWorkspaceTabChromeDomain>
