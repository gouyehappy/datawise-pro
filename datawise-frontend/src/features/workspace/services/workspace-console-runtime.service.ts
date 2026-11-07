export type ConsoleRunningMap = Record<string, boolean>
export type ConsoleGenerationMap = Record<string, number>

export function isConsoleRunning(running: ConsoleRunningMap, tabId: string): boolean {
    return !!running[tabId]
}

export function beginConsoleRun(
    generations: ConsoleGenerationMap,
    running: ConsoleRunningMap,
    tabId: string,
) {
    const generation = (generations[tabId] ?? 0) + 1
    return {
        generations: {...generations, [tabId]: generation},
        running: {...running, [tabId]: true},
        generation,
    }
}

export function endConsoleRun(
    generations: ConsoleGenerationMap,
    running: ConsoleRunningMap,
    tabId: string,
    generation: number,
): ConsoleRunningMap {
    if (generations[tabId] !== generation) return running
    if (!(tabId in running)) return running
    const next = {...running}
    delete next[tabId]
    return next
}

export function isConsoleRunCurrent(
    generations: ConsoleGenerationMap,
    tabId: string,
    generation: number,
): boolean {
    return generations[tabId] === generation
}

export function invalidateConsoleRun(
    generations: ConsoleGenerationMap,
    running: ConsoleRunningMap,
    tabId: string,
) {
    const generation = (generations[tabId] ?? 0) + 1
    const nextGenerations = {...generations, [tabId]: generation}
    if (!(tabId in running)) return {generations: nextGenerations, running}
    const nextRunning = {...running}
    delete nextRunning[tabId]
    return {generations: nextGenerations, running: nextRunning}
}

export function clearConsoleLocalState(
    query: Record<string, unknown>,
    generations: ConsoleGenerationMap,
    running: ConsoleRunningMap,
    tabId: string,
) {
    const nextQuery = {...query}
    delete nextQuery[tabId]
    const nextGenerations = {...generations}
    delete nextGenerations[tabId]
    const nextRunning = {...running}
    delete nextRunning[tabId]
    return {query: nextQuery, generations: nextGenerations, running: nextRunning}
}
