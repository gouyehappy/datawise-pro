/**
 * PERF-13: shallow signature for workspace session persist scheduling.
 * Avoid deep-watching tab.sql payloads on every keystroke.
 * Pair with `sessionPersistTick` for sql body edits only.
 */
export function workspaceSessionStructureKey(
    activeTabId: string | null | undefined,
    tabs: readonly {
        id: string
        title?: string
        type?: string
        connectionId?: string
        instanceId?: string | null
        database?: string
        sqlFile?: string
    }[],
    tabGroups: readonly {id: string; title?: string; collapsed?: boolean}[],
    tabFloatKeys: readonly string[],
): string {
    return [
        activeTabId ?? '',
        tabs
            .map((tab) =>
                [
                    tab.id,
                    tab.title ?? '',
                    tab.type ?? '',
                    tab.connectionId ?? '',
                    tab.instanceId ?? '',
                    tab.database ?? '',
                    tab.sqlFile ?? '',
                ].join('\0'),
            )
            .join('\n'),
        tabGroups
            .map((group) => `${group.id}\0${group.title ?? ''}\0${group.collapsed ? '1' : '0'}`)
            .join('\n'),
        [...tabFloatKeys].sort().join('\0'),
    ].join('|')
}
