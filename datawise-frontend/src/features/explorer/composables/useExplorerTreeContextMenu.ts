import {ref} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import type {ContextMenuItem, TreeNode} from '@/core/types'
import {useContextMenuAnchor} from '@/core/context-menu'
import {
    filterRenameProjectFileMenuItems,
} from '@/features/explorer/services/connection-tree-helpers'
import {
    injectProjectFileMoveSubmenu,
    isProjectSandboxMovableNode,
    listProjectFileMoveTargets,
} from '@/features/explorer/services/explorer-project-file-move.service'
import {getContextMenuForNodeType} from '@/features/explorer/constants/context-menus'
import {buildElasticsearchIndexMenuItems} from '@/features/explorer/services/elasticsearch-index-menu.service'
import {resolveTableContext} from '@/features/explorer/services/table-context-actions.service'
import {filterCreateNamespaceMenuItems} from '@/features/explorer/services/create-namespace.service'
import {canDdlConnection} from '@/features/team/services/connection-access.service'
import {
    isExplorerFavoritesTreeNode,
} from '@/features/explorer/services/explorer-favorites.actions'
import {resolveConnectionDbType} from '@/features/explorer/services/explorer-lazy-load'
import {
    prependJdbcSshTunnelMenuItems,
    resolveExplorerContextMenuType,
    withCsvImportMenuDisabled,
} from '@/features/explorer/services/explorer-context-menu-builders.service'
import {
    buildExplorerConnectionMenuItems as buildExplorerConnectionMenuItemsForTree,
    buildExplorerGroupMenuItems as buildExplorerGroupMenuItemsForTree,
    buildExplorerPinContextMenuItems as buildExplorerPinContextMenuItemsForTree,
    buildExplorerSshScriptRecordMenuItems as buildExplorerSshScriptRecordMenuItemsForTree,
    buildExplorerSshScriptRecordsMenuItems as buildExplorerSshScriptRecordsMenuItemsForTree,
    buildExplorerSshTerminalMenuItems as buildExplorerSshTerminalMenuItemsForTree,
    type ExplorerContextMenuDeps,
} from '@/features/explorer/services/explorer-context-menu.service'
import {isCsvImportSupported} from '@/shared/capabilities/db-type-capabilities'
import {filterExplorerCapabilityMenuItems} from '@/shared/capabilities/supports-connection-feature'
import {CAPABILITY_HINT_I18N} from '@/shared/capabilities/capability-keys'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {filterPluginGatedMenuItems} from '@/features/plugin/services/plugin-registry.service'
import {
    filterExplorerContextMenuByPermission,
} from '@/features/explorer/services/explorer-context-menu-permission.service'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import {isJdbcSshTunnelEnabled, supportsJdbcTunnelSshMenu} from '@/features/ssh/services/ssh-jdbc-tunnel.service'
import {
    appendCommunityContextMenuItems,
} from '@/features/community-plugin/lib/community-context-menu'
import {useCommunityPluginContributionStore} from '@/features/community-plugin/stores/community-plugin-contributions'
import type {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import type {useTeamStore} from '@/features/team/stores/team-store'
import type {useProjectStore} from '@/features/project/stores/project'

export interface ExplorerTreeContextMenuDeps {
    t: ComposerTranslation
    explorer: ReturnType<typeof useExplorerStore>
    catalogStore: ReturnType<typeof useDatasourceCatalogStore>
    teamStore: ReturnType<typeof useTeamStore>
    projectStore: ReturnType<typeof useProjectStore>
    findConnectionId: (node: TreeNode) => string | undefined
}

export function useExplorerTreeContextMenu(deps: ExplorerTreeContextMenuDeps) {
    const {t, explorer, catalogStore, teamStore, projectStore, findConnectionId} = deps
    const explorerMenuDeps: ExplorerContextMenuDeps = {t, explorer, catalogStore, teamStore, projectStore}

    const {visible: menuVisible, pos: menuPos, target: contextNode, open, close: closeMenu} =
        useContextMenuAnchor<TreeNode>()
    const menuItems = ref<ContextMenuItem[]>([])

    function buildSshScriptRecordsMenuItems(): ContextMenuItem[] {
        return buildExplorerSshScriptRecordsMenuItemsForTree(explorerMenuDeps)
    }

    function buildSshScriptRecordMenuItems(): ContextMenuItem[] {
        return buildExplorerSshScriptRecordMenuItemsForTree(explorerMenuDeps)
    }

    function buildSshTerminalMenuItems(): ContextMenuItem[] {
        return buildExplorerSshTerminalMenuItemsForTree(explorerMenuDeps)
    }

    function buildConnectionMenuItems(node: TreeNode): ContextMenuItem[] {
        const base = buildExplorerConnectionMenuItemsForTree(node, explorerMenuDeps)
        const community = useCommunityPluginContributionStore()
        community.ensureLoaded()
        return appendCommunityContextMenuItems(base, community.contextMenusFor('connection'))
    }

    function buildGroupMenuItems(node: TreeNode): ContextMenuItem[] {
        return buildExplorerGroupMenuItemsForTree(node, explorerMenuDeps)
    }

    function buildPinContextMenuItems(node: TreeNode, items: ContextMenuItem[]): ContextMenuItem[] {
        return buildExplorerPinContextMenuItemsForTree(node, items, explorerMenuDeps)
    }

    function onContextMenu(e: MouseEvent, node: TreeNode) {
        void openContextMenu(e, node)
    }

    async function openContextMenu(e: MouseEvent, node: TreeNode) {
        if (isExplorerFavoritesTreeNode(node)) return
        if (node.type === 'project-files-draft' || node.type === 'group-draft') return
        explorer.selectNode(node.id)
        let items = getContextMenuForNodeType(resolveExplorerContextMenuType(node), t)
        // 仅真实项目文件/子目录可重命名；根节点与空目录提示除外
        items = filterRenameProjectFileMenuItems(node, items)
        if (isProjectSandboxMovableNode(node)) {
            const targets = listProjectFileMoveTargets(explorer.tree, node)
            items = injectProjectFileMoveSubmenu(
                items,
                targets,
                t('explorer.context.moveProjectFile'),
            )
        }
        if (node.type === 'table') {
            const ctx = resolveTableContext(explorer.tree, node)
            if (ctx?.dbType === 'elasticsearch') {
                items = buildElasticsearchIndexMenuItems(t)
            } else if (!isCsvImportSupported(ctx?.dbType, catalogStore.items)) {
                items = withCsvImportMenuDisabled(items, t(CAPABILITY_HINT_I18N.csvImport))
            }
            const community = useCommunityPluginContributionStore()
            community.ensureLoaded()
            items = appendCommunityContextMenuItems(items, community.contextMenusFor('table'))
        }
        if (node.type === 'view') {
            const community = useCommunityPluginContributionStore()
            community.ensureLoaded()
            items = appendCommunityContextMenuItems(items, community.contextMenusFor('view'))
        }
        if (node.type === 'connection') {
            void projectStore.load().catch(() => undefined)
            items = buildConnectionMenuItems(node)
            if (supportsJdbcTunnelSshMenu(node.dbType)) {
                try {
                    const config = await fetchConnectionConfig(node.id)
                    if (isJdbcSshTunnelEnabled(config)) {
                        items = prependJdbcSshTunnelMenuItems(items, t)
                    }
                } catch {
                    // ignore lookup failures
                }
            }
        }
        if (node.type === 'ssh-script-records') {
            items = buildSshScriptRecordsMenuItems()
        }
        if (node.type === 'ssh-script-record') {
            items = buildSshScriptRecordMenuItems()
        }
        if (node.type === 'ssh-terminal') {
            items = buildSshTerminalMenuItems()
        }
        if (node.type === 'group') {
            items = buildGroupMenuItems(node)
        }
        const connectionDbType = resolveConnectionDbType(explorer.tree, node.id)
        if (node.type === 'database' || node.type === 'table' || node.type === 'folder-tables') {
            items = filterExplorerCapabilityMenuItems(items, connectionDbType, catalogStore.items)
        }
        if (node.type === 'database') {
            const connectionId = findConnectionId(node)
            items = filterCreateNamespaceMenuItems(items, connectionDbType, {
                canDdl: connectionId ? canDdlConnection(connectionId, teamStore.teams) : false,
            })
        }
        items = filterPluginGatedMenuItems(items, (id) => usePluginStore().isEnabled(id))
        items = buildPinContextMenuItems(node, items)
        items = filterExplorerContextMenuByPermission(items, {nodeType: node.type})
        if (items.length === 0) return
        menuItems.value = items
        open(e, node)
    }

    return {
        menuVisible,
        menuPos,
        menuItems,
        contextNode,
        closeMenu,
        onContextMenu,
        openContextMenu,
    }
}
