/**
 * PERF-08: shallow signature for syncing lastDockedTabId.
 * Ignores tab title / payload patches so SQL edits do not deep-trigger WorkspaceArea.
 */
export function workspaceDockedTabSyncKey(
    activeTabId: string | null | undefined,
    tabs: readonly {id: string}[],
    tabFloats: Record<string, unknown>,
): string {
    return [
        activeTabId ?? '',
        tabs.map((tab) => tab.id).join('\0'),
        Object.keys(tabFloats).sort().join('\0'),
    ].join('|')
}
