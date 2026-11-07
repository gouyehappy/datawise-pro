import type {ConsoleQueryState, QueryResultItem} from '@/features/workspace/types/query-result'

/** Collect server cursor ids still held by console result panes. */
export function collectConsoleCursorIds(state: ConsoleQueryState | undefined | null): string[] {
    if (!state?.results?.length) return []
    const ids: string[] = []
    for (const item of state.results) {
        const cursorId = item.cursorId?.trim()
        if (cursorId) ids.push(cursorId)
    }
    return ids
}

export function collectCursorIdsFromResults(results: readonly QueryResultItem[] | undefined | null): string[] {
    if (!results?.length) return []
    const ids: string[] = []
    for (const item of results) {
        const cursorId = item.cursorId?.trim()
        if (cursorId) ids.push(cursorId)
    }
    return ids
}

/** Fire-and-forget cursor release; failures are ignored (TTL still cleans up). */
export function releaseSqlCursorsBestEffort(
    cursorIds: readonly string[],
    closeCursor: (cursorId: string) => Promise<unknown>,
): void {
    for (const cursorId of cursorIds) {
        void closeCursor(cursorId).catch(() => undefined)
    }
}
