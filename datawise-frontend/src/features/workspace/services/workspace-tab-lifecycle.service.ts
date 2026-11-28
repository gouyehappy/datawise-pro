import type {WorkspaceTab} from '@/core/types'

export interface CloseSqlFileTabsOptions {
    connectionId: string
    instanceId?: string | null
    fileName: string
}

export interface CloseTableTabsOptions {
    connectionId?: string
    database?: string
    tableName: string
}

export function findConsoleTabIdsForSqlFile(
    tabs: WorkspaceTab[],
    options: CloseSqlFileTabsOptions,
): string[] {
    const fileName = options.fileName.trim()
    if (!fileName) return []
    return tabs
        .filter(
            (tab) =>
                tab.type === 'console' &&
                tab.connectionId === options.connectionId &&
                tab.sqlFile === fileName &&
                (options.instanceId == null || tab.instanceId === options.instanceId),
        )
        .map((tab) => tab.id)
}

export function findTableTabIds(tabs: WorkspaceTab[], options: CloseTableTabsOptions): string[] {
    const tableName = options.tableName.trim()
    if (!tableName) return []
    return tabs
        .filter(
            (tab) =>
                tab.type === 'table' &&
                tab.tableName === tableName &&
                (!options.connectionId || tab.connectionId === options.connectionId) &&
                (!options.database || tab.database === options.database),
        )
        .map((tab) => tab.id)
}

export function findOtherTabIds(tabs: WorkspaceTab[], keepTabId: string): string[] {
    return tabs.filter((tab) => tab.id !== keepTabId).map((tab) => tab.id)
}

export function findClosableTabIdsBefore(tabs: WorkspaceTab[], tabId: string): string[] {
    const index = tabs.findIndex((tab) => tab.id === tabId)
    if (index <= 0) return []
    return tabs
        .slice(0, index)
        .filter((tab) => tab.closable)
        .map((tab) => tab.id)
}

export function findClosableTabIdsAfter(tabs: WorkspaceTab[], tabId: string): string[] {
    const index = tabs.findIndex((tab) => tab.id === tabId)
    if (index < 0 || index >= tabs.length - 1) return []
    return tabs
        .slice(index + 1)
        .filter((tab) => tab.closable)
        .map((tab) => tab.id)
}

export function resolveNextActiveTabIdAfterClose(
    tabs: WorkspaceTab[],
    closedIndex: number,
): string | null {
    const remaining = tabs.filter((_, index) => index !== closedIndex)
    return remaining[Math.max(0, closedIndex - 1)]?.id ?? null
}

export function resolveBulkCloseActiveTabId(
    remaining: WorkspaceTab[],
    keepTabId: string,
    currentActiveId: string | null,
): string | null {
    if (remaining.some((tab) => tab.id === currentActiveId)) return currentActiveId
    return keepTabId
}

/**
 * Connection ids whose last community/SSH workbench tab was just closed.
 * JDBC consoles are intentionally excluded — pool idle eviction owns those.
 */
export function findOrphanedWorkbenchConnectionIds(
    closed: readonly WorkspaceTab[],
    remaining: readonly WorkspaceTab[],
): string[] {
    const candidates = new Set<string>()
    for (const tab of closed) {
        const connectionId = tab.connectionId?.trim()
        if (!connectionId) continue
        if (tab.type !== 'community-workbench' && tab.type !== 'ssh-terminal') continue
        candidates.add(connectionId)
    }
    if (candidates.size === 0) return []
    return [...candidates].filter(
        (connectionId) => !remaining.some((tab) => tab.connectionId === connectionId),
    )
}
