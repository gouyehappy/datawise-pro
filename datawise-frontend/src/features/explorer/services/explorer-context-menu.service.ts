import type {ContextMenuItem, TreeNode} from '@/core/types'
import type {ComposerTranslation} from 'vue-i18n'
import {getContextMenuForNodeType} from '@/features/explorer/constants/context-menus'
import {filterCreateNamespaceMenuItems} from '@/features/explorer/services/create-namespace.service'
import {
    buildPinContextMenuItems as createPinContextMenuItems,
    buildSpecializedConnectionMenuItems,
    prependMoveConnectionHereMenuItems,
} from '@/features/explorer/services/explorer-context-menu-builders.service'
import {
    buildConnectionLifecycleMenuItems,
    prependConnectionLifecycleMenu,
    resolveConnectionLinkState,
} from '@/features/explorer/services/explorer-connection-lifecycle.service'
import {resolveExplorerCatalogMessageKey} from '@/features/explorer/services/explorer-catalog-messages'
import {
    canMoveConnectionToGroup,
    injectConnectionMoveSubmenu,
    listConnectionMoveTargets,
} from '@/features/explorer/services/explorer-move-connection.service'
import {
    injectProjectConnectionSubmenus,
    listOtherProjects,
} from '@/features/explorer/services/explorer-project-connection.service'
import {
    buildSshScriptRecordMenuItems,
    buildSshScriptRecordsMenuItems,
    buildSshTerminalMenuItems,
} from '@/features/explorer/services/ssh-feature-tree.service'
import {canDdlConnection} from '@/features/team/services/connection-access.service'
import {filterSqlContextMenuItems} from '@/shared/capabilities/db-type-capabilities'
import type {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import type {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {useTeamStore} from '@/features/team/stores/team-store'
import type {useProjectStore} from '@/features/project/stores/project'

export interface ExplorerContextMenuDeps {
    t: ComposerTranslation
    explorer: ReturnType<typeof useExplorerStore>
    catalogStore: ReturnType<typeof useDatasourceCatalogStore>
    teamStore: ReturnType<typeof useTeamStore>
    projectStore?: ReturnType<typeof useProjectStore>
}

export function buildExplorerSshScriptRecordsMenuItems(deps: ExplorerContextMenuDeps): ContextMenuItem[] {
    return buildSshScriptRecordsMenuItems(deps.t)
}

export function buildExplorerSshScriptRecordMenuItems(deps: ExplorerContextMenuDeps): ContextMenuItem[] {
    return buildSshScriptRecordMenuItems(deps.t)
}

export function buildExplorerSshTerminalMenuItems(deps: ExplorerContextMenuDeps): ContextMenuItem[] {
    return buildSshTerminalMenuItems(deps.t)
}

export function buildExplorerConnectionMenuItems(
    node: TreeNode,
    deps: ExplorerContextMenuDeps,
): ContextMenuItem[] {
    const {t, explorer, catalogStore, teamStore, projectStore} = deps
    const state = resolveConnectionLinkState(
        node.id,
        explorer.pooledConnectionIds,
        explorer.connectionHealthById,
        explorer.loadingNodeIds,
    )
    const lifecycleItems = buildConnectionLifecycleMenuItems(t, state)
    const moveTargets = listConnectionMoveTargets(explorer.tree, node.id)
    const withMove = (items: ContextMenuItem[]) => {
        const withGroupMove = injectConnectionMoveSubmenu(
            items,
            moveTargets,
            t(resolveExplorerCatalogMessageKey('moveConnection')),
        )
        if (!projectStore || projectStore.apiUnavailable) return withGroupMove
        const otherProjects = listOtherProjects(projectStore.projects, projectStore.activeProjectId)
        return injectProjectConnectionSubmenus(withGroupMove, otherProjects, {
            moveToProject: t('explorer.context.moveToProject'),
            shareToProject: t('explorer.context.shareToProject'),
        })
    }
    const specialized = buildSpecializedConnectionMenuItems(node.dbType, t)
    if (specialized) {
        return prependConnectionLifecycleMenu(withMove(specialized), lifecycleItems)
    }
    return prependConnectionLifecycleMenu(
        withMove(filterSqlContextMenuItems(
            filterCreateNamespaceMenuItems(
                getContextMenuForNodeType('connection', t),
                node.dbType,
                {canDdl: canDdlConnection(node.id, teamStore.teams)},
            ),
            node.dbType,
            catalogStore.items,
        )),
        lifecycleItems,
    )
}

export function buildExplorerGroupMenuItems(
    node: TreeNode,
    deps: ExplorerContextMenuDeps,
): ContextMenuItem[] {
    const {t, explorer} = deps
    const items = getContextMenuForNodeType('group', t)
    const selected = explorer.selectedNode
    if (
        selected?.type === 'connection'
        && canMoveConnectionToGroup(explorer.tree, selected.id, node.id)
    ) {
        return prependMoveConnectionHereMenuItems(items, selected.label, t)
    }
    return items
}

export function buildExplorerPinContextMenuItems(
    node: TreeNode,
    items: ContextMenuItem[],
    deps: ExplorerContextMenuDeps,
): ContextMenuItem[] {
    return createPinContextMenuItems(node, items, deps.explorer.isNodePinned(node.id), deps.t)
}
