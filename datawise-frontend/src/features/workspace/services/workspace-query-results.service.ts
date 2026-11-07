import type {ConsoleQueryState, QueryResultItem} from '@/features/workspace/types/query-result'

export type WorkspaceQueryResultsMap = Record<string, ConsoleQueryState>

export function ensureConsoleQueryState(state: WorkspaceQueryResultsMap, tabId: string): ConsoleQueryState {
    if (!state[tabId]) {
        state[tabId] = {
            results: [],
            activeView: -1,
        }
    }
    return state[tabId]
}

export function getConsoleQueryState(state: WorkspaceQueryResultsMap, tabId: string): ConsoleQueryState {
    return ensureConsoleQueryState(state, tabId)
}

export function renumberResultLabels(
    results: QueryResultItem[],
    resolveLabel: (item: QueryResultItem, index: number) => string,
) {
    results.forEach((item, index) => {
        item.label = resolveLabel(item, index)
    })
}

export function setConsoleQueryResults(
    state: WorkspaceQueryResultsMap,
    tabId: string,
    results: QueryResultItem[],
    options: {
        seal: (item: QueryResultItem) => QueryResultItem
        fallbackLabel: (index: number) => string
    },
) {
    // Seal each payload (rows/columns) but keep the tab list itself reactive
    // so close/rename/splice replacements show up in the result TabBar.
    const nextResults = results.map((item, index) =>
        options.seal({
            ...item,
            id: item.id || `result-${index}-${Date.now()}`,
            label: item.label || options.fallbackLabel(index + 1),
        }),
    )

    const activeView: ConsoleQueryState['activeView'] =
        nextResults.length === 0 ? -1 : nextResults.length - 1

    const existing = state[tabId]
    if (existing) {
        existing.results = nextResults
        existing.activeView = activeView
        return
    }
    state[tabId] = {
        results: nextResults,
        activeView,
    }
}

export function updateConsoleQueryResultAtIndex(
    state: WorkspaceQueryResultsMap,
    tabId: string,
    index: number,
    item: QueryResultItem,
    replaceAt: (map: WorkspaceQueryResultsMap, tabId: string, index: number, item: QueryResultItem) => void,
) {
    // Mutate nested results in place to avoid cloning the whole tab -> query map.
    replaceAt(state, tabId, index, item)
}

export function recalculateConsoleExecutionTotals(
    state: WorkspaceQueryResultsMap,
    tabId: string,
    options: {
        sumTotals: (results: QueryResultItem[]) => {totalRows: number; totalDuration: number}
        applyStatus: (rows: number, durationMs: number) => void
    },
) {
    const tabState = state[tabId]
    if (!tabState) return
    const {totalRows, totalDuration} = options.sumTotals(tabState.results)
    options.applyStatus(totalRows, totalDuration)
}

export function setConsoleActiveView(state: WorkspaceQueryResultsMap, tabId: string, view: number) {
    const tabState = state[tabId]
    if (!tabState) return
    state[tabId] = {
        ...tabState,
        activeView: view,
    }
}

function commitResults(
    state: WorkspaceQueryResultsMap,
    tabId: string,
    tabState: ConsoleQueryState,
    nextResults: QueryResultItem[],
    activeView: ConsoleQueryState['activeView'],
    resolveLabel?: (item: QueryResultItem, index: number) => string,
) {
    if (resolveLabel) renumberResultLabels(nextResults, resolveLabel)
    // Replace the list (do not splice a markRaw array) so Vue re-renders the TabBar.
    state[tabId] = {
        ...tabState,
        results: nextResults,
        activeView,
    }
}

export function closeConsoleQueryResult(
    state: WorkspaceQueryResultsMap,
    tabId: string,
    index: number,
    resolveLabel: (item: QueryResultItem, index: number) => string,
) {
    const tabState = state[tabId]
    if (!tabState || index < 0 || index >= tabState.results.length) return

    const nextResults = tabState.results.filter((_, i) => i !== index)

    if (nextResults.length === 0) {
        commitResults(state, tabId, tabState, nextResults, -1, resolveLabel)
        return
    }

    const current = tabState.activeView
    let activeView = current
    if (current >= 0) {
        if (current === index) {
            activeView = Math.min(index, nextResults.length - 1)
        } else if (current > index) {
            activeView = current - 1
        }
    }
    commitResults(state, tabId, tabState, nextResults, activeView, resolveLabel)
}

export function closeOtherConsoleQueryResults(
    state: WorkspaceQueryResultsMap,
    tabId: string,
    keepIndex: number,
    resolveLabel: (item: QueryResultItem, index: number) => string,
) {
    const tabState = state[tabId]
    if (!tabState?.results[keepIndex]) return

    commitResults(state, tabId, tabState, [tabState.results[keepIndex]], 0, resolveLabel)
}

export function closeConsoleQueryResultsToLeft(
    state: WorkspaceQueryResultsMap,
    tabId: string,
    index: number,
    resolveLabel: (item: QueryResultItem, index: number) => string,
) {
    const tabState = state[tabId]
    if (!tabState || index <= 0) return

    const nextResults = tabState.results.slice(index)
    if (nextResults.length === 0) {
        commitResults(state, tabId, tabState, nextResults, -1, resolveLabel)
        return
    }
    const activeView = tabState.activeView < 0 ? tabState.activeView : Math.max(0, tabState.activeView - index)
    commitResults(state, tabId, tabState, nextResults, activeView, resolveLabel)
}

export function closeConsoleQueryResultsToRight(
    state: WorkspaceQueryResultsMap,
    tabId: string,
    index: number,
    resolveLabel: (item: QueryResultItem, index: number) => string,
) {
    const tabState = state[tabId]
    if (!tabState || index < 0 || index >= tabState.results.length - 1) return

    const nextResults = tabState.results.slice(0, index + 1)
    const activeView = tabState.activeView >= 0 && tabState.activeView > index ? index : tabState.activeView
    commitResults(state, tabId, tabState, nextResults, activeView, resolveLabel)
}

export function getConsoleQueryResultLabel(
    state: WorkspaceQueryResultsMap,
    tabId: string,
    index: number,
): string {
    return state[tabId]?.results[index]?.label ?? ''
}

export function renameConsoleQueryResult(
    state: WorkspaceQueryResultsMap,
    tabId: string,
    index: number,
    label: string,
): boolean {
    const tabState = state[tabId]
    if (!tabState?.results[index]) return false
    const next = label.trim()
    if (!next) return false
    tabState.results[index].label = next
    return true
}

export function closeAllConsoleQueryResults(state: WorkspaceQueryResultsMap, tabId: string) {
    const tabState = state[tabId]
    if (!tabState) return
    commitResults(state, tabId, tabState, [], -1)
}
