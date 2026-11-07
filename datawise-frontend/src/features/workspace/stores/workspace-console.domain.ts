/**
 * Workspace console domain (A-12): query-result bag + run generations.
 * Kept as a factory over shared refs so `useWorkspaceStore` remains the public facade.
 */
import type {Ref} from 'vue'
import type {ConsoleQueryState, QueryResultItem} from '@/features/workspace/types'
import {resolveQueryResultTabLabel} from '@/features/workspace/services/query-result-item'
import {
    replaceConsoleQueryResultAtIndex,
    sumConsoleQueryTotals,
} from '@/features/workspace/services/query-result-refresh.service'
import {
    closeAllConsoleQueryResults as closeAllConsoleQueryResultsForTab,
    closeConsoleQueryResult as closeConsoleQueryResultForTab,
    closeConsoleQueryResultsToLeft as closeConsoleQueryResultsToLeftForTab,
    closeConsoleQueryResultsToRight as closeConsoleQueryResultsToRightForTab,
    closeOtherConsoleQueryResults as closeOtherConsoleQueryResultsForTab,
    ensureConsoleQueryState as ensureConsoleQueryStateForTab,
    getConsoleQueryResultLabel as getConsoleQueryResultLabelForTab,
    getConsoleQueryState as getConsoleQueryStateForTab,
    recalculateConsoleExecutionTotals as recalculateConsoleExecutionTotalsForTab,
    renameConsoleQueryResult as renameConsoleQueryResultForTab,
    setConsoleActiveView as setConsoleActiveViewForTab,
    setConsoleQueryResults as setConsoleQueryResultsForTab,
    updateConsoleQueryResultAtIndex as updateConsoleQueryResultAtIndexForTab,
} from '@/features/workspace/services/workspace-query-results.service'
import {
    beginConsoleRun as beginConsoleRunForTab,
    clearConsoleLocalState as clearConsoleLocalStateForTab,
    endConsoleRun as endConsoleRunForTab,
    invalidateConsoleRun as invalidateConsoleRunForTab,
    isConsoleRunCurrent as isConsoleRunCurrentForTab,
    isConsoleRunning as isConsoleRunningForTab,
    type ConsoleGenerationMap,
    type ConsoleRunningMap,
} from '@/features/workspace/services/workspace-console-runtime.service'
import {
    collectConsoleCursorIds,
    collectCursorIdsFromResults,
    releaseSqlCursorsBestEffort,
} from '@/features/workspace/services/sql-cursor-release.service'
import {sealQueryResultPayload} from '@/features/workspace/services/query-result-seal'
import {t} from '@/i18n'
import {sqlApi} from '@/api'

export type WorkspaceConsoleDomainDeps = {
    consoleQueryByTabId: Ref<Record<string, ConsoleQueryState>>
    consoleRunningByTabId: Ref<ConsoleRunningMap>
    consoleRunGenerationByTabId: Ref<ConsoleGenerationMap>
    setExecutionResult: (rows: number, durationMs: number) => void
    /** Optional hook when clearing tab-local console state (e.g. clear SSH dirty). */
    onClearTabExtras?: (tabId: string) => void
    closeCursor?: (cursorId: string) => Promise<unknown>
    cancelExecution?: (args: {sessionKey: string; mode: 'connection'}) => Promise<unknown>
}

export function createWorkspaceConsoleDomain(deps: WorkspaceConsoleDomainDeps) {
    const closeCursor = deps.closeCursor ?? ((cursorId: string) => sqlApi.closeCursor(cursorId))
    const cancelExecution =
        deps.cancelExecution ?? ((args: {sessionKey: string; mode: 'connection'}) => sqlApi.cancelExecution(args))

    function isConsoleRunning(tabId: string): boolean {
        return isConsoleRunningForTab(deps.consoleRunningByTabId.value, tabId)
    }

    function beginConsoleRun(tabId: string): number {
        const next = beginConsoleRunForTab(
            deps.consoleRunGenerationByTabId.value,
            deps.consoleRunningByTabId.value,
            tabId,
        )
        deps.consoleRunGenerationByTabId.value = next.generations
        deps.consoleRunningByTabId.value = next.running
        return next.generation
    }

    function endConsoleRun(tabId: string, generation: number) {
        deps.consoleRunningByTabId.value = endConsoleRunForTab(
            deps.consoleRunGenerationByTabId.value,
            deps.consoleRunningByTabId.value,
            tabId,
            generation,
        )
    }

    function isConsoleRunCurrent(tabId: string, generation: number): boolean {
        return isConsoleRunCurrentForTab(deps.consoleRunGenerationByTabId.value, tabId, generation)
    }

    function invalidateConsoleRun(tabId: string) {
        const next = invalidateConsoleRunForTab(
            deps.consoleRunGenerationByTabId.value,
            deps.consoleRunningByTabId.value,
            tabId,
        )
        deps.consoleRunGenerationByTabId.value = next.generations
        deps.consoleRunningByTabId.value = next.running
    }

    function cancelConsoleExecutionBestEffort(tabId: string) {
        if (!isConsoleRunning(tabId)) {
            invalidateConsoleRun(tabId)
            return
        }
        invalidateConsoleRun(tabId)
        void cancelExecution({sessionKey: tabId, mode: 'connection'}).catch(() => undefined)
    }

    function clearTabConsoleLocalState(tabId: string) {
        const pendingCursors = collectConsoleCursorIds(deps.consoleQueryByTabId.value[tabId])
        const cleared = clearConsoleLocalStateForTab(
            deps.consoleQueryByTabId.value,
            deps.consoleRunGenerationByTabId.value,
            deps.consoleRunningByTabId.value,
            tabId,
        )
        deps.consoleQueryByTabId.value = cleared.query as Record<string, ConsoleQueryState>
        deps.consoleRunGenerationByTabId.value = cleared.generations
        deps.consoleRunningByTabId.value = cleared.running
        deps.onClearTabExtras?.(tabId)
        releaseSqlCursorsBestEffort(pendingCursors, closeCursor)
    }

    function ensureConsoleQueryState(tabId: string): ConsoleQueryState {
        return ensureConsoleQueryStateForTab(deps.consoleQueryByTabId.value, tabId)
    }

    function getConsoleQueryState(tabId: string): ConsoleQueryState {
        return getConsoleQueryStateForTab(deps.consoleQueryByTabId.value, tabId)
    }

    function setConsoleQueryResults(tabId: string, results: QueryResultItem[]) {
        setConsoleQueryResultsForTab(deps.consoleQueryByTabId.value, tabId, results, {
            seal: sealQueryResultPayload,
            fallbackLabel: (n) => t('queryResult.resultTab', {n}),
        })
    }

    function updateConsoleQueryResultAtIndex(tabId: string, index: number, item: QueryResultItem) {
        updateConsoleQueryResultAtIndexForTab(
            deps.consoleQueryByTabId.value,
            tabId,
            index,
            item,
            replaceConsoleQueryResultAtIndex,
        )
    }

    function recalculateConsoleExecutionTotals(tabId: string) {
        recalculateConsoleExecutionTotalsForTab(deps.consoleQueryByTabId.value, tabId, {
            sumTotals: sumConsoleQueryTotals,
            applyStatus: deps.setExecutionResult,
        })
    }

    function appendConsoleQueryResultPage(tabId: string, index: number, item: QueryResultItem) {
        updateConsoleQueryResultAtIndex(tabId, index, item)
        recalculateConsoleExecutionTotals(tabId)
    }

    function setConsoleActiveView(tabId: string, view: number) {
        setConsoleActiveViewForTab(deps.consoleQueryByTabId.value, tabId, view)
    }

    function closeConsoleQueryResult(tabId: string, index: number) {
        const cursorId = deps.consoleQueryByTabId.value[tabId]?.results[index]?.cursorId
        closeConsoleQueryResultForTab(
            deps.consoleQueryByTabId.value,
            tabId,
            index,
            resolveQueryResultTabLabel,
        )
        if (cursorId) {
            releaseSqlCursorsBestEffort([cursorId], closeCursor)
        }
    }

    function closeOtherConsoleQueryResults(tabId: string, keepIndex: number) {
        const results = deps.consoleQueryByTabId.value[tabId]?.results ?? []
        const released = collectCursorIdsFromResults(results.filter((_, index) => index !== keepIndex))
        closeOtherConsoleQueryResultsForTab(
            deps.consoleQueryByTabId.value,
            tabId,
            keepIndex,
            resolveQueryResultTabLabel,
        )
        releaseSqlCursorsBestEffort(released, closeCursor)
    }

    function closeConsoleQueryResultsToLeft(tabId: string, index: number) {
        const results = deps.consoleQueryByTabId.value[tabId]?.results ?? []
        const released = collectCursorIdsFromResults(results.slice(0, index))
        closeConsoleQueryResultsToLeftForTab(
            deps.consoleQueryByTabId.value,
            tabId,
            index,
            resolveQueryResultTabLabel,
        )
        releaseSqlCursorsBestEffort(released, closeCursor)
    }

    function closeConsoleQueryResultsToRight(tabId: string, index: number) {
        const results = deps.consoleQueryByTabId.value[tabId]?.results ?? []
        const released = collectCursorIdsFromResults(results.slice(index + 1))
        closeConsoleQueryResultsToRightForTab(
            deps.consoleQueryByTabId.value,
            tabId,
            index,
            resolveQueryResultTabLabel,
        )
        releaseSqlCursorsBestEffort(released, closeCursor)
    }

    function getConsoleQueryResultLabel(tabId: string, index: number) {
        return getConsoleQueryResultLabelForTab(deps.consoleQueryByTabId.value, tabId, index)
    }

    function renameConsoleQueryResult(tabId: string, index: number, label: string) {
        return renameConsoleQueryResultForTab(deps.consoleQueryByTabId.value, tabId, index, label)
    }

    function closeAllConsoleQueryResults(tabId: string) {
        const released = collectConsoleCursorIds(deps.consoleQueryByTabId.value[tabId])
        closeAllConsoleQueryResultsForTab(deps.consoleQueryByTabId.value, tabId)
        releaseSqlCursorsBestEffort(released, closeCursor)
    }

    function resetConsoleQueryBag() {
        deps.consoleQueryByTabId.value = {}
    }

    return {
        isConsoleRunning,
        beginConsoleRun,
        endConsoleRun,
        isConsoleRunCurrent,
        invalidateConsoleRun,
        cancelConsoleExecutionBestEffort,
        clearTabConsoleLocalState,
        ensureConsoleQueryState,
        getConsoleQueryState,
        setConsoleQueryResults,
        updateConsoleQueryResultAtIndex,
        appendConsoleQueryResultPage,
        recalculateConsoleExecutionTotals,
        setConsoleActiveView,
        closeConsoleQueryResult,
        closeOtherConsoleQueryResults,
        closeConsoleQueryResultsToLeft,
        closeConsoleQueryResultsToRight,
        getConsoleQueryResultLabel,
        renameConsoleQueryResult,
        closeAllConsoleQueryResults,
        resetConsoleQueryBag,
    }
}

export type WorkspaceConsoleDomain = ReturnType<typeof createWorkspaceConsoleDomain>
