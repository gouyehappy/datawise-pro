import {describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import {createWorkspaceOpenDomain} from '@/features/workspace/stores/workspace-open.domain'
import {createWorkspaceOpenAppsDomain} from '@/features/workspace/stores/workspace-open-apps.domain'

vi.mock('@/features/workspace/services/workspace-tab-touch', () => ({
    touchStatelessWorkspaceTab: vi.fn(),
}))

vi.mock('@/features/workspace/services/workspace-tab-id', () => ({
    nextWorkspaceTabId: (type: string) => `new-${type}`,
    currentWorkspaceTabCounter: () => 1,
}))

vi.mock('@/i18n', () => ({
    t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('@/features/explorer/utils/data-sources', () => ({
    extractDataSources: () => [],
    findDataSource: () => undefined,
    pickDefaultDataSource: () => undefined,
    resolvePreferredConsoleInstance: () => ({instanceId: undefined, database: undefined}),
}))

vi.mock('@/features/explorer/services/explorer-lazy-load', () => ({
    isCatalogSchemaDbType: () => false,
}))

vi.mock('@/features/explorer/services/sql-script.service', () => ({
    resolveNextScriptFileForOpen: vi.fn(async () => 'Script-1.sql'),
}))

vi.mock('@/features/explorer/services/view-model-open.service', () => ({
    resolveNextViewModelNameForOpen: vi.fn(async () => 'view_model_1'),
}))

describe('createWorkspaceOpenAppsDomain', () => {
    function setup() {
        const tabs = ref<WorkspaceTab[]>([])
        const activeTabId = ref<string | null>(null)
        const openCore = createWorkspaceOpenDomain({
            tabs,
            activeTabId,
            resolveConnectionLabel: () => 'Conn',
        })
        const apps = createWorkspaceOpenAppsDomain({
            tabs,
            activeTabId,
            resolveConnectionLabel: () => 'Conn',
            getActiveTab: () => tabs.value.find((t) => t.id === activeTabId.value) ?? null,
            ensureConsoleQueryState: vi.fn(),
            getExplorer: () => ({
                tree: [],
                connectionHealthById: {},
                pooledConnectionIds: [],
                findNode: () => null,
                ensureChildrenLoaded: vi.fn(async () => undefined),
            }),
            openTab: openCore.openTab,
            openWithPlan: openCore.openWithPlan,
            openMatchedTab: openCore.openMatchedTab,
            setDatabaseModule: vi.fn(),
            canOpenConnectionForm: () => true,
            onPermissionDenied: vi.fn(),
            guardAiNav: () => true,
            guardGovernancePack: () => true,
            readViewModel: vi.fn(async () => ({sql: 'select 1', draft: false})),
            yieldFrame: async () => undefined,
        })
        return {tabs, activeTabId, apps}
    }

    it('openConnectionForm creates connection tab', () => {
        const {tabs, activeTabId, apps} = setup()
        const id = apps.openConnectionForm('mysql')
        expect(id).toBe('new-connection')
        expect(tabs.value[0]?.type).toBe('connection')
        expect(activeTabId.value).toBe(id)
    })

    it('openCreateNamespace reuses matching tab', () => {
        const {tabs, activeTabId, apps} = setup()
        const first = apps.openCreateNamespace({
            connectionId: 'c1',
            mode: 'database',
            connectionName: 'Host',
        })
        const second = apps.openCreateNamespace({
            connectionId: 'c1',
            mode: 'database',
            connectionName: 'Host',
        })
        expect(second).toBe(first)
        expect(tabs.value).toHaveLength(1)
        expect(activeTabId.value).toBe(first)
    })

    it('openTableMigration merges preselected tables on reuse', () => {
        const {tabs, apps} = setup()
        apps.openTableMigration({
            source: {
                connectionId: 'c1',
                database: 'db',
                connectionLabel: 'C',
                dbType: 'mysql',
            },
            preselectedTables: ['a'],
        })
        apps.openTableMigration({
            source: {
                connectionId: 'c1',
                database: 'db',
                connectionLabel: 'C',
                dbType: 'mysql',
            },
            preselectedTables: ['b'],
        })
        expect(tabs.value).toHaveLength(1)
        expect(tabs.value[0]?.migrationPreselectedTables).toEqual(['a', 'b'])
    })

    it('openPlatformCatalog blocks when AI guard fails', () => {
        const tabs = ref<WorkspaceTab[]>([])
        const activeTabId = ref<string | null>(null)
        const openCore = createWorkspaceOpenDomain({
            tabs,
            activeTabId,
            resolveConnectionLabel: () => 'Conn',
        })
        const apps = createWorkspaceOpenAppsDomain({
            tabs,
            activeTabId,
            resolveConnectionLabel: () => 'Conn',
            getActiveTab: () => null,
            ensureConsoleQueryState: vi.fn(),
            getExplorer: () => ({
                tree: [],
                connectionHealthById: {},
                pooledConnectionIds: [],
                findNode: () => null,
                ensureChildrenLoaded: vi.fn(async () => undefined),
            }),
            openTab: openCore.openTab,
            openWithPlan: openCore.openWithPlan,
            openMatchedTab: openCore.openMatchedTab,
            setDatabaseModule: vi.fn(),
            canOpenConnectionForm: () => true,
            onPermissionDenied: vi.fn(),
            guardAiNav: () => false,
            guardGovernancePack: () => true,
            readViewModel: vi.fn(async () => ({sql: ''})),
        })
        const id = apps.openPlatformCatalog({
            feature: 'semantic_metrics',
            connectionId: 'c1',
            database: 'db',
        })
        expect(id).toBeNull()
        expect(tabs.value).toHaveLength(0)
    })

    it('openConsole creates console tab', async () => {
        const {tabs, activeTabId, apps} = setup()
        const id = await apps.openConsole({
            connectionId: 'c1',
            connectionName: 'Conn',
            instanceId: 'i1',
            database: 'db',
            sql: 'select 1',
            skipEnsureScriptFile: true,
        })
        expect(id).toBe('new-console')
        expect(tabs.value[0]?.type).toBe('console')
        expect(tabs.value[0]?.sql).toBe('select 1')
        expect(activeTabId.value).toBe(id)
    })
})
