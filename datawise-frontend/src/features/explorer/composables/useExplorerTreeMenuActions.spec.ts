import {describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import type {TreeNode} from '@/core/types'
import {useExplorerTreeMenuActions} from '@/features/explorer/composables/useExplorerTreeMenuActions'

vi.mock('@/features/explorer/services/explorer-context-menu-permission.service', () => ({
    canRunExplorerContextMenuAction: () => true,
}))

vi.mock('@/features/explorer/services/explorer-pinned-sort.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/features/explorer/services/explorer-pinned-sort.service')>()
    return {
        ...actual,
        resolvePinToastMessageKey: () => 'explorer.pin.toggled',
    }
})

function tableNode(overrides: Partial<TreeNode> = {}): TreeNode {
    return {
        id: 'table-1',
        label: 'users',
        type: 'table',
        children: [],
        ...overrides,
    } as TreeNode
}

function buildDeps(overrides: Record<string, unknown> = {}) {
    const closeMenu = vi.fn()
    const showSuccessToast = vi.fn()
    const showErrorToast = vi.fn()
    const togglePinnedNode = vi.fn().mockReturnValue(true)
    const contextNode = ref<TreeNode | null>(tableNode())

    const deps = {
        t: ((key: string) => key) as never,
        explorer: {
            selectedNode: null,
            tree: [],
            findNode: vi.fn(),
            togglePinnedNode,
            selectNode: vi.fn(),
            connectConnection: vi.fn(),
            reconnectConnection: vi.fn(),
            disconnectConnection: vi.fn(),
            reloadConnectionCatalog: vi.fn(),
            reloadTablesFolder: vi.fn(),
        } as never,
        workspace: {
            openConnectionForm: vi.fn(),
            openKafkaTablePublish: vi.fn(),
            openTableMigration: vi.fn(),
            openMetadataDoc: vi.fn(),
            openSchemaEr: vi.fn(),
            openSchemaTables: vi.fn(),
            openSchemaCompare: vi.fn(),
            openCrossEnvCompare: vi.fn(),
            openViewModelEditor: vi.fn(),
            openViewModelLineage: vi.fn(),
            openPlatformCatalog: vi.fn(),
            openCreateNamespace: vi.fn(),
            openConsole: vi.fn(),
            openWithPlan: vi.fn(),
            setStatus: vi.fn(),
        } as never,
        layout: {
            setModule: vi.fn(),
            showSuccessToast,
            showErrorToast,
            showToast: vi.fn(),
            startExport: vi.fn(),
        } as never,
        entitlement: {guardMetaDoc: () => true} as never,
        catalogStore: {items: []} as never,
        teamStore: {teams: []} as never,
        findConnectionId: () => 'conn-1',
        findConnectionLabel: () => 'MySQL',
        contextNode,
        closeMenu,
        pendingSqlFileNode: ref(null),
        deleteSqlMessage: ref(''),
        showDeleteSqlDialog: ref(false),
        pendingProjectFileNode: ref(null),
        deleteProjectFileMessage: ref(''),
        showDeleteProjectFileDialog: ref(false),
        pendingSshScriptRecordNode: ref(null),
        deleteSshScriptRecordMessage: ref(''),
        showDeleteSshScriptRecordDialog: ref(false),
        renameSshScriptRecordDefaultName: ref(''),
        showRenameSshScriptRecordDialog: ref(false),
        pendingTableAction: ref(null),
        showTableActionDialog: ref(false),
        pendingViewModelNode: ref(null),
        renameViewModelDefaultName: ref(''),
        showRenameViewModelDialog: ref(false),
        deleteViewModelMessage: ref(''),
        showDeleteViewModelDialog: ref(false),
        recentSqlContext: ref(null),
        showRecentSqlDialog: ref(false),
        pendingDeleteDatabase: ref(null),
        showDeleteDatabaseDialog: ref(false),
        pendingDeleteCatalogNode: ref(null),
        showDeleteCatalogDialog: ref(false),
        openViewModelMigrationFromNode: vi.fn(),
        createProjectSqlFromMenu: vi.fn(),
        beginProjectInlineCreate: vi.fn(),
        beginRenameProjectFile: vi.fn(),
        refreshProjectFilesFromMenu: vi.fn(),
        beginCreateSubgroup: vi.fn(),
        beginRenameGroup: vi.fn(),
        beginRenameSqlFile: vi.fn(),
        onOpen: vi.fn(),
        openTableFromNode: vi.fn(),
        openViewModelConsoleFromNode: vi.fn(),
        openSqlExportWizard: vi.fn(),
        openRestoreWizard: vi.fn(),
        platformWorkspaceOpenHandlers: () => ({}) as never,
        createSshScriptRecord: vi.fn(),
        refreshSshScriptRecordsFolder: vi.fn(),
        performMoveConnection: vi.fn(),
        performMoveProjectFile: vi.fn(),
        performMoveConnectionToProject: vi.fn(),
        performShareConnectionToProject: vi.fn(),
        ...overrides,
    }

    return {deps, closeMenu, showSuccessToast, togglePinnedNode, contextNode}
}

describe('useExplorerTreeMenuActions', () => {
    it('pin menu action toggles pin, toasts, and closes menu', () => {
        const {deps, closeMenu, showSuccessToast, togglePinnedNode} = buildDeps()
        const {onMenuSelect} = useExplorerTreeMenuActions(deps as never)

        onMenuSelect('pin')

        expect(togglePinnedNode).toHaveBeenCalledWith('table-1')
        expect(showSuccessToast).toHaveBeenCalledWith('explorer.pin.toggled')
        expect(closeMenu).toHaveBeenCalled()
    })
})
