import {describe, expect, it, vi} from 'vitest'
import type {TreeNode} from '@/core/types'
import {useExplorerTreeNodeNavigation} from '@/features/explorer/composables/useExplorerTreeNodeNavigation'

vi.mock('@/features/auth/services/feature-permission.service', () => ({
    canManageExplorerConnectionLifecycle: () => true,
}))

vi.mock('@/features/explorer/services/explorer-node-open.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/features/explorer/services/explorer-node-open.service')>()
    return {
        ...actual,
        resolveExplorerNodeOpenKind: (node: TreeNode) =>
            node.type === 'connection' ? 'connection' : actual.resolveExplorerNodeOpenKind(node),
    }
})

vi.mock('@/features/explorer/services/explorer-favorites.actions', () => ({
    openPinnedTableFavorite: vi.fn(),
    shouldOpenFavoriteTable: () => null,
}))

vi.mock('@/features/explorer/services/explorer-node-select.service', () => ({
    resolveExplorerFavoritesNavIntent: () => null,
    resolveExplorerNodeSelectIntent: () => ({kind: 'select'}),
}))

function connectionNode(overrides: Partial<TreeNode> = {}): TreeNode {
    return {
        id: 'conn-1',
        label: 'MySQL',
        type: 'connection',
        children: [],
        ...overrides,
    } as TreeNode
}

describe('useExplorerTreeNodeNavigation', () => {
    it('onOpen connection calls explorer.connectConnection', async () => {
        const connectConnection = vi.fn().mockResolvedValue(undefined)
        const selectNode = vi.fn()
        const nav = useExplorerTreeNodeNavigation({
            t: ((key: string) => key) as never,
            explorer: {
                connectConnection,
                selectNode,
                findNode: vi.fn(),
                toggleExpand: vi.fn(),
                showAllFavoriteTables: vi.fn(),
            } as never,
            workspace: {
                openWithPlan: vi.fn(),
                openTable: vi.fn(),
                openPlatformCatalog: vi.fn(),
                openSshTerminal: vi.fn(),
                openSshScriptRecord: vi.fn(),
            } as never,
            layout: {
                setModule: vi.fn(),
                showErrorToast: vi.fn(),
            } as never,
            auth: {isGuest: false} as never,
            shortcutPanel: {
                syncExplorerInfo: vi.fn(),
            } as never,
            findConnectionId: () => 'conn-1',
            findConnectionLabel: () => 'MySQL',
            platformWorkspaceOpenHandlers: () => ({openWithPlan: vi.fn()} as never),
        })

        await nav.onOpen(connectionNode())

        expect(selectNode).toHaveBeenCalledWith('conn-1')
        expect(connectConnection).toHaveBeenCalledWith('conn-1', {notify: true})
    })
})
