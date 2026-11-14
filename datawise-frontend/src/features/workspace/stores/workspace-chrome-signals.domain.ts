/**
 * Workspace chrome signals (A-12 knife 3): status bar, dirty flags, refresh/auto-run nudges.
 * Factory over shared refs — `useWorkspaceStore` remains the public facade.
 */
import type {Ref} from 'vue'
import type {StatusSnapshot, WorkspaceTab} from '@/core/types'
import {buildExecutionStatus} from '@/features/workspace/services/workspace-status.service'
import {isWorkspaceTabDirty} from '@/features/workspace/utils/workspace-tab-dirty'
import {t} from '@/i18n'

export type WorkspaceChromeSignalsDeps = {
    tabs: Ref<WorkspaceTab[]>
    status: Ref<StatusSnapshot>
    sshScriptDirtyByTabId: Ref<Record<string, boolean>>
    /** PERF-17: cached dirty bits for console/local-text so Tab bar skips sql string compares. */
    contentDirtyByTabId: Ref<Record<string, boolean>>
    tableDataRefreshSeq: Ref<Record<string, number>>
    /** Bumped when a sticky tab is re-activated so hosts can soft-refresh (docs / plugins / forms). */
    tabActivateRefreshSeq: Ref<Record<string, number>>
    fakeDataDialogRequest: Ref<{tabId: string; nonce: number} | null>
    consoleAutoRunRequest: Ref<{tabId: string; nonce: number} | null>
    /** B2-1: side-rail AI in query mode → focus console AI prompt */
    consoleAiPromptRequest: Ref<{tabId: string; nonce: number} | null>
}

export function createWorkspaceChromeSignalsDomain(deps: WorkspaceChromeSignalsDeps) {
    function setStatus(message: string) {
        deps.status.value = {...deps.status.value, message}
    }

    function setExecutionResult(rows: number, durationMs: number) {
        deps.status.value = buildExecutionStatus(rows, durationMs, (count) =>
            t('workspace.rowCount', {count}),
        )
    }

    function syncContentDirtyFlag(tab: WorkspaceTab) {
        if (tab.type !== 'console' && tab.type !== 'local-text') return
        const dirty = isWorkspaceTabDirty(tab, deps.sshScriptDirtyByTabId.value)
        const prev = deps.contentDirtyByTabId.value[tab.id] ?? false
        if (dirty === prev) return
        if (dirty) {
            deps.contentDirtyByTabId.value = {
                ...deps.contentDirtyByTabId.value,
                [tab.id]: true,
            }
            return
        }
        if (!(tab.id in deps.contentDirtyByTabId.value)) return
        const next = {...deps.contentDirtyByTabId.value}
        delete next[tab.id]
        deps.contentDirtyByTabId.value = next
    }

    function clearContentDirtyFlag(tabId: string) {
        if (!(tabId in deps.contentDirtyByTabId.value)) return
        const next = {...deps.contentDirtyByTabId.value}
        delete next[tabId]
        deps.contentDirtyByTabId.value = next
    }

    function isTabDirty(tabId: string): boolean {
        const tab = deps.tabs.value.find((item) => item.id === tabId)
        if (!tab) return false
        if (tab.type === 'console' || tab.type === 'local-text') {
            return Boolean(deps.contentDirtyByTabId.value[tabId])
        }
        return isWorkspaceTabDirty(tab, deps.sshScriptDirtyByTabId.value)
    }

    function setSshScriptDirty(tabId: string, dirty: boolean) {
        if (dirty) {
            deps.sshScriptDirtyByTabId.value = {
                ...deps.sshScriptDirtyByTabId.value,
                [tabId]: true,
            }
            return
        }
        if (!(tabId in deps.sshScriptDirtyByTabId.value)) return
        const next = {...deps.sshScriptDirtyByTabId.value}
        delete next[tabId]
        deps.sshScriptDirtyByTabId.value = next
    }

    function bumpTableDataRefresh(tabId: string) {
        deps.tableDataRefreshSeq.value = {
            ...deps.tableDataRefreshSeq.value,
            [tabId]: (deps.tableDataRefreshSeq.value[tabId] ?? 0) + 1,
        }
    }

    function bumpTabActivateRefresh(tabId: string) {
        deps.tabActivateRefreshSeq.value = {
            ...deps.tabActivateRefreshSeq.value,
            [tabId]: (deps.tabActivateRefreshSeq.value[tabId] ?? 0) + 1,
        }
    }

    function requestFakeDataDialog(tabId: string) {
        deps.fakeDataDialogRequest.value = {tabId, nonce: Date.now()}
    }

    function requestConsoleAutoRun(tabId: string) {
        deps.consoleAutoRunRequest.value = {tabId, nonce: Date.now()}
    }

    function clearConsoleAutoRun() {
        deps.consoleAutoRunRequest.value = null
    }

    function requestConsoleAiPrompt(tabId: string) {
        deps.consoleAiPromptRequest.value = {tabId, nonce: Date.now()}
    }

    function clearConsoleAiPrompt() {
        deps.consoleAiPromptRequest.value = null
    }

    return {
        setStatus,
        setExecutionResult,
        isTabDirty,
        syncContentDirtyFlag,
        clearContentDirtyFlag,
        setSshScriptDirty,
        bumpTableDataRefresh,
        bumpTabActivateRefresh,
        requestFakeDataDialog,
        requestConsoleAutoRun,
        clearConsoleAutoRun,
        requestConsoleAiPrompt,
        clearConsoleAiPrompt,
    }
}

export type WorkspaceChromeSignalsDomain = ReturnType<typeof createWorkspaceChromeSignalsDomain>
