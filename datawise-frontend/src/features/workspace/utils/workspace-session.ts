import type {WorkspaceTab} from '@/core/types'
import type {WorkspaceTabSnapshot} from '@/shared/config/app-config.types'
import {isLocalAbsolutePath} from '@/features/local-files/services/local-files-path'
import {isProjectFileUri} from '@/features/project/services/project-files-api'

const RESTORABLE_TAB_TYPES = new Set<WorkspaceTab['type']>(['console', 'table', 'terminal', 'local-text'])

/** Cap embedded SQL/text bodies in session snapshots (chars across sql+savedSql+savedContent). */
export const MAX_SESSION_TAB_BODY_CHARS = 256_000

function clipSessionBodyField(value: string | undefined): string | undefined {
    if (value == null) return value
    if (value.length <= MAX_SESSION_TAB_BODY_CHARS) return value
    return `${value.slice(0, MAX_SESSION_TAB_BODY_CHARS)}\n-- [truncated for session snapshot]`
}

function isDiskBackedPath(path: string | null | undefined): boolean {
    const value = path?.trim()
    if (!value) return false
    return isLocalAbsolutePath(value) || isProjectFileUri(value)
}

/** Local absolute / project sandbox file tabs: persist path metadata only; body loads on select. */
export function isDiskBackedTabSnapshot(tab: {
    type?: string
    localFilePath?: string | null
    sqlFile?: string | null
}): boolean {
    if (tab.type === 'local-text') return isDiskBackedPath(tab.localFilePath)
    if (tab.type === 'console') return isDiskBackedPath(tab.sqlFile)
    return false
}

function isDiskBackedTabDirty(tab: WorkspaceTab): boolean {
    if (tab.type === 'local-text') {
        return (tab.sql ?? '') !== (tab.savedContent ?? '')
    }
    if (tab.type === 'console') {
        return (tab.sql ?? '') !== (tab.savedSql ?? '')
    }
    return false
}

function bodyFieldsForCapture(tab: WorkspaceTab): Pick<WorkspaceTabSnapshot, 'sql' | 'savedSql' | 'savedContent'> {
    // Disk-backed clean tabs: path is enough. Keep body only while dirty so refresh doesn't drop edits.
    if (isDiskBackedTabSnapshot(tab) && !isDiskBackedTabDirty(tab)) {
        return {}
    }
    const sql = tab.sql ?? ''
    const savedSql = tab.savedSql ?? ''
    const savedContent = tab.savedContent ?? ''
    const total = sql.length + savedSql.length + savedContent.length
    if (total <= MAX_SESSION_TAB_BODY_CHARS) {
        return {
            sql: tab.sql,
            savedSql: tab.savedSql,
            savedContent: tab.savedContent,
        }
    }
    // Prefer clipping the live buffer; keep saved* shorter so restore still has an anchor.
    return {
        sql: clipSessionBodyField(tab.sql),
        savedSql: clipSessionBodyField(tab.savedSql),
        savedContent: clipSessionBodyField(tab.savedContent),
    }
}

function bodyFieldsForRestore(snap: WorkspaceTabSnapshot): Pick<WorkspaceTab, 'sql' | 'savedSql' | 'savedContent'> {
    if (isDiskBackedTabSnapshot(snap)) {
        // Legacy app.xml may still embed full file text — ignore unless this was a dirty snapshot.
        if (snap.type === 'local-text') {
            if (
                typeof snap.sql === 'string'
                && typeof snap.savedContent === 'string'
                && snap.sql !== snap.savedContent
            ) {
                return {sql: snap.sql, savedContent: snap.savedContent}
            }
            return {}
        }
        if (
            typeof snap.sql === 'string'
            && typeof snap.savedSql === 'string'
            && snap.sql !== snap.savedSql
        ) {
            return {sql: snap.sql, savedSql: snap.savedSql}
        }
        return {}
    }
    return {
        sql: snap.sql,
        savedSql: snap.savedSql ?? (snap.type === 'console' ? (snap.sql ?? '') : undefined),
        savedContent: snap.savedContent ?? (snap.type === 'local-text' ? (snap.sql ?? '') : undefined),
    }
}

export function captureWorkspaceTabs(tabs: WorkspaceTab[]): WorkspaceTabSnapshot[] {
    return tabs
        .filter((tab) => RESTORABLE_TAB_TYPES.has(tab.type))
        .map((tab) => ({
            type: tab.type,
            title: tab.title,
            ...bodyFieldsForCapture(tab),
            sqlFile: tab.sqlFile,
            localFilePath: tab.localFilePath,
            tableName: tab.tableName,
            connectionId: tab.connectionId,
            instanceId: tab.instanceId,
            database: tab.database,
            explorerNodeId: tab.explorerNodeId,
            dbType: tab.dbType,
            tableView: tab.tableView,
            tableSection: tab.tableSection,
            tabGroupId: tab.tabGroupId,
            teamSharedQuery: tab.teamSharedQuery,
        }))
}

export function resolveActiveTabIndex(tabs: WorkspaceTab[], activeTabId: string | null): number {
    if (!activeTabId || !tabs.length) return 0
    const index = tabs.findIndex((tab) => tab.id === activeTabId)
    return index >= 0 ? index : 0
}

export function buildWorkspaceTabsFromSnapshots(
    snapshots: WorkspaceTabSnapshot[],
    createId: (prefix: string) => string,
    resolvePrefix: (type: WorkspaceTab['type']) => string,
): WorkspaceTab[] {
    return snapshots.map((snap) => {
        const id = createId(resolvePrefix(snap.type))
        const body = bodyFieldsForRestore(snap)
        return {
            id,
            title: snap.title,
            type: snap.type,
            closable: true,
            ...body,
            sqlFile: snap.sqlFile,
            localFilePath: snap.localFilePath,
            tableName: snap.tableName,
            connectionId: snap.connectionId,
            instanceId: snap.instanceId,
            database: snap.database,
            explorerNodeId: snap.explorerNodeId,
            dbType: snap.dbType,
            tableView: snap.tableView ?? (snap.type === 'table' ? 'properties' : undefined),
            tableSection: snap.tableSection ?? (snap.type === 'table' ? 'columns' : undefined),
            tabGroupId: snap.tabGroupId,
            teamSharedQuery: snap.teamSharedQuery,
        }
    })
}

export function resolveRestoredActiveTabId(tabs: WorkspaceTab[], activeTabIndex = 0): string | null {
    if (!tabs.length) return null
    const index = Math.min(Math.max(0, activeTabIndex), tabs.length - 1)
    return tabs[index]?.id ?? null
}

/**
 * True when a restored disk-backed tab still needs its file body from disk.
 *
 * Use savedContent / savedSql as the "successfully loaded" marker — not `sql`.
 * Monaco can write `sql=''` before hydrate finishes; treating that as loaded
 * left project docs blank until close/reopen.
 */
export function tabNeedsDiskContentHydration(tab: {
    type?: string
    localFilePath?: string | null
    sqlFile?: string | null
    sql?: string
    savedContent?: string
    savedSql?: string
}): boolean {
    if (!isDiskBackedTabSnapshot(tab)) return false
    if (tab.type === 'local-text') return typeof tab.savedContent !== 'string'
    if (tab.type === 'console') return typeof tab.savedSql !== 'string'
    return false
}
