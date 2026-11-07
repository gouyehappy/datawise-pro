import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildWorkspaceTabsFromSnapshots,
    captureWorkspaceTabs,
    isDiskBackedTabSnapshot,
    resolveRestoredActiveTabId,
    tabNeedsDiskContentHydration,
} from '@/features/workspace/utils/workspace-session'
import type {WorkspaceTab} from '@/core/types'
import type {WorkspaceTabSnapshot} from '@/shared/config/app-config.types'

const createId = (prefix: string) => `${prefix}-x`
const resolvePrefix = (type: string) => type

describe('workspace-session', () => {
    it('builds restorable tabs from snapshots with console defaults', () => {
        const snapshots: WorkspaceTabSnapshot[] = [
            {
                type: 'console',
                title: 'Console',
                sql: 'select 1',
                connectionId: 'conn-1',
            },
            {
                type: 'table',
                title: 'Users',
                tableName: 'users',
                connectionId: 'conn-1',
            },
        ]
        const tabs = buildWorkspaceTabsFromSnapshots(snapshots, createId, resolvePrefix)
        assert.equal(tabs.length, 2)
        assert.equal(tabs[0]?.id, 'console-x')
        assert.equal(tabs[0]?.savedSql, 'select 1')
        assert.equal(tabs[1]?.tableView, 'properties')
        assert.equal(tabs[1]?.tableSection, 'columns')
    })

    it('keeps explicit savedSql and table view state', () => {
        const snapshots: WorkspaceTabSnapshot[] = [
            {
                type: 'console',
                title: 'Console',
                sql: 'select 2',
                savedSql: 'saved',
                connectionId: 'conn-1',
            },
            {
                type: 'table',
                title: 'Orders',
                tableName: 'orders',
                tableView: 'data',
                tableSection: 'indexes',
                connectionId: 'conn-1',
            },
        ]
        const tabs = buildWorkspaceTabsFromSnapshots(snapshots, createId, resolvePrefix)
        assert.equal(tabs[0]?.savedSql, 'saved')
        assert.equal(tabs[1]?.tableView, 'data')
        assert.equal(tabs[1]?.tableSection, 'indexes')
    })

    it('resolves and clamps the restored active tab id', () => {
        const tabs = buildWorkspaceTabsFromSnapshots(
            [
                {type: 'console', title: 'A', connectionId: 'c1'},
                {type: 'table', title: 'B', tableName: 'b', connectionId: 'c1'},
            ],
            createId,
            resolvePrefix,
        )
        assert.equal(resolveRestoredActiveTabId(tabs, 1), 'table-x')
        assert.equal(resolveRestoredActiveTabId(tabs, 99), tabs[tabs.length - 1]?.id)
        assert.equal(resolveRestoredActiveTabId([], 0), null)
    })

    it('omits clean local-text body from capture and ignores legacy body on restore', () => {
        const tabs: WorkspaceTab[] = [
            {
                id: 'lt-1',
                title: 'notes.md',
                type: 'local-text',
                closable: true,
                localFilePath: 'E:\\docs\\notes.md',
                sql: '# huge markdown body',
                savedContent: '# huge markdown body',
                explorerNodeId: 'local-file:e:/docs/notes.md',
            },
        ]
        const snapshots = captureWorkspaceTabs(tabs)
        assert.equal(snapshots.length, 1)
        assert.equal(snapshots[0]?.localFilePath, 'E:\\docs\\notes.md')
        assert.equal(snapshots[0]?.sql, undefined)
        assert.equal(snapshots[0]?.savedContent, undefined)
        assert.ok(isDiskBackedTabSnapshot(snapshots[0]!))

        const restored = buildWorkspaceTabsFromSnapshots(
            [
                {
                    type: 'local-text',
                    title: 'notes.md',
                    localFilePath: 'E:\\docs\\notes.md',
                    sql: '# leftover from old app.xml',
                    savedContent: '# leftover from old app.xml',
                },
            ],
            createId,
            resolvePrefix,
        )
        assert.equal(restored[0]?.sql, undefined)
        assert.equal(restored[0]?.savedContent, undefined)
        assert.equal(tabNeedsDiskContentHydration(restored[0]!), true)
    })

    it('keeps dirty local-text body in the session snapshot', () => {
        const tabs: WorkspaceTab[] = [
            {
                id: 'lt-2',
                title: 'notes.md',
                type: 'local-text',
                closable: true,
                localFilePath: 'E:\\docs\\notes.md',
                sql: 'edited',
                savedContent: 'saved',
            },
        ]
        const snapshots = captureWorkspaceTabs(tabs)
        assert.equal(snapshots[0]?.sql, 'edited')
        assert.equal(snapshots[0]?.savedContent, 'saved')

        const restored = buildWorkspaceTabsFromSnapshots(snapshots, createId, resolvePrefix)
        assert.equal(restored[0]?.sql, 'edited')
        assert.equal(restored[0]?.savedContent, 'saved')
        assert.equal(tabNeedsDiskContentHydration(restored[0]!), false)
    })

    it('omits clean absolute local SQL console body from capture', () => {
        const tabs: WorkspaceTab[] = [
            {
                id: 'c-1',
                title: 'query.sql',
                type: 'console',
                closable: true,
                sqlFile: 'E:\\docs\\query.sql',
                sql: 'select 1',
                savedSql: 'select 1',
            },
        ]
        const snapshots = captureWorkspaceTabs(tabs)
        assert.equal(snapshots[0]?.sqlFile, 'E:\\docs\\query.sql')
        assert.equal(snapshots[0]?.sql, undefined)
        assert.equal(snapshots[0]?.savedSql, undefined)
    })

    it('treats project sandbox URIs as disk-backed and omits clean body', () => {
        const uri = 'dw-project://proj_default/docs/connectors.md'
        const tabs: WorkspaceTab[] = [
            {
                id: 'lt-proj',
                title: 'connectors.md',
                type: 'local-text',
                closable: true,
                localFilePath: uri,
                sql: '# connectors',
                savedContent: '# connectors',
            },
        ]
        assert.equal(isDiskBackedTabSnapshot(tabs[0]!), true)
        const snapshots = captureWorkspaceTabs(tabs)
        assert.equal(snapshots[0]?.localFilePath, uri)
        assert.equal(snapshots[0]?.sql, undefined)
        const restored = buildWorkspaceTabsFromSnapshots(snapshots, createId, resolvePrefix)
        assert.equal(tabNeedsDiskContentHydration(restored[0]!), true)

        const consoleSnap = captureWorkspaceTabs([
            {
                id: 'c-proj',
                title: 'a.sql',
                type: 'console',
                closable: true,
                sqlFile: 'dw-project://proj_default/scripts/a.sql',
                sql: 'select 1',
                savedSql: 'select 1',
            },
        ])
        assert.equal(isDiskBackedTabSnapshot(consoleSnap[0]!), true)
        assert.equal(consoleSnap[0]?.sql, undefined)
    })

    it('clips oversized console bodies when capturing session', async () => {
        const {MAX_SESSION_TAB_BODY_CHARS} = await import('@/features/workspace/utils/workspace-session')
        const huge = 'x'.repeat(MAX_SESSION_TAB_BODY_CHARS + 10)
        const tabs: WorkspaceTab[] = [
            {
                id: 'c-huge',
                title: 'huge',
                type: 'console',
                closable: true,
                sql: huge,
                savedSql: 'small',
            },
        ]
        const snapshots = captureWorkspaceTabs(tabs)
        assert.ok((snapshots[0]?.sql?.length ?? 0) <= MAX_SESSION_TAB_BODY_CHARS + 40)
        assert.match(snapshots[0]?.sql ?? '', /truncated for session snapshot/)
        assert.equal(snapshots[0]?.savedSql, 'small')
    })

    it('still needs hydration when Monaco wrote empty sql before the file body loaded', () => {
        assert.equal(
            tabNeedsDiskContentHydration({
                type: 'local-text',
                localFilePath: 'dw-project://proj_default/docs/a.md',
                sql: '',
            }),
            true,
        )
        assert.equal(
            tabNeedsDiskContentHydration({
                type: 'local-text',
                localFilePath: 'dw-project://proj_default/docs/a.md',
                sql: '',
                savedContent: '',
            }),
            false,
        )
        assert.equal(
            tabNeedsDiskContentHydration({
                type: 'console',
                sqlFile: 'E:\\docs\\q.sql',
                sql: '',
            }),
            true,
        )
    })
})
