import {describe, expect, it, vi} from 'vitest'
import type {TreeNode} from '@/core/types'
import {useExplorerTreeContextMenu} from '@/features/explorer/composables/useExplorerTreeContextMenu'

vi.mock('@/features/explorer/services/explorer-favorites.actions', () => ({
    isExplorerFavoritesTreeNode: () => false,
}))

vi.mock('@/features/explorer/constants/context-menus', () => ({
    getContextMenuForNodeType: () => [
        {id: 'refresh', label: 'Refresh'},
    ],
}))

vi.mock('@/features/explorer/services/explorer-context-menu-builders.service', () => ({
    resolveExplorerContextMenuType: (node: TreeNode) => node.type,
    prependJdbcSshTunnelMenuItems: (items: unknown[]) => items,
    withCsvImportMenuDisabled: (items: unknown[]) => items,
}))

vi.mock('@/features/explorer/services/explorer-context-menu.service', () => ({
    buildExplorerConnectionMenuItems: () => [{id: 'edit', label: 'Edit'}],
    buildExplorerGroupMenuItems: () => [],
    buildExplorerPinContextMenuItems: (_node: TreeNode, items: unknown[]) => items,
    buildExplorerSshScriptRecordMenuItems: () => [],
    buildExplorerSshScriptRecordsMenuItems: () => [],
    buildExplorerSshTerminalMenuItems: () => [],
}))

vi.mock('@/features/explorer/services/connection-tree-helpers', () => ({
    filterRenameProjectFileMenuItems: (_node: TreeNode, items: unknown[]) => items,
}))

vi.mock('@/features/plugin/services/plugin-registry.service', () => ({
    filterPluginGatedMenuItems: (items: unknown[]) => items,
}))

vi.mock('@/features/explorer/services/explorer-context-menu-permission.service', () => ({
    filterExplorerContextMenuByPermission: (items: unknown[]) => items,
}))

vi.mock('@/features/community-plugin/stores/community-plugin-contributions', () => ({
    useCommunityPluginContributionStore: () => ({
        ensureLoaded: vi.fn(),
        contextMenusFor: () => [],
    }),
}))

vi.mock('@/features/community-plugin/lib/community-context-menu', () => ({
    appendCommunityContextMenuItems: (items: unknown[]) => items,
}))

vi.mock('@/features/ssh/services/ssh-jdbc-tunnel.service', () => ({
    supportsJdbcTunnelSshMenu: () => false,
    isJdbcSshTunnelEnabled: () => false,
}))

describe('useExplorerTreeContextMenu', () => {
    it('openContextMenu selects node and populates menuItems', async () => {
        const selectNode = vi.fn()
        const node = {
            id: 'conn-1',
            label: 'MySQL',
            type: 'connection',
            children: [],
        } as TreeNode

        const menu = useExplorerTreeContextMenu({
            t: ((key: string) => key) as never,
            explorer: {
                selectNode,
                tree: [node],
                findNode: () => node,
            } as never,
            catalogStore: {items: []} as never,
            teamStore: {teams: []} as never,
            projectStore: {
                load: vi.fn().mockResolvedValue(undefined),
            } as never,
            findConnectionId: () => 'conn-1',
        })

        await menu.openContextMenu(new MouseEvent('contextmenu'), node)

        expect(selectNode).toHaveBeenCalledWith('conn-1')
        expect(menu.menuItems.value.length).toBeGreaterThan(0)
        expect(menu.menuVisible.value).toBe(true)
        expect(menu.contextNode.value).toEqual(node)
    })
})
