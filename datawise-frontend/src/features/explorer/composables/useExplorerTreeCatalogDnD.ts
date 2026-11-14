import {computed} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {canMutateConnectionCatalog} from '@/features/auth/services/feature-permission.service'
import {resolveConnectionCatalogErrorMessage} from '@/features/connection/services/connection-catalog.service'
import {resolveExplorerCatalogMessageKey} from '@/features/explorer/services/explorer-catalog-messages'
import {canMoveConnectionToGroup} from '@/features/explorer/services/explorer-move-connection.service'
import {
    canMoveProjectFileToFolder,
    findProjectFileParentFolderId,
    isProjectSandboxMovableNode,
    resolveProjectFileDropFolderId,
} from '@/features/explorer/services/explorer-project-file-move.service'
import {moveProjectFileNode} from '@/features/project/services/project-explorer-files'
import type {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {useLayoutStore} from '@/features/layout/stores/layout'
import type {useAuthStore} from '@/features/auth/stores/auth-store'
import type {useProjectStore} from '@/features/project/stores/project'

export interface ExplorerTreeCatalogDnDDeps {
    t: ComposerTranslation
    explorer: ReturnType<typeof useExplorerStore>
    layout: ReturnType<typeof useLayoutStore>
    auth: ReturnType<typeof useAuthStore>
    projectStore: ReturnType<typeof useProjectStore>
}

export function useExplorerTreeCatalogDnD(deps: ExplorerTreeCatalogDnDDeps) {
    const {t, explorer, layout, auth, projectStore} = deps

    const connectionDragEnabled = computed(() => canMutateConnectionCatalog(auth.isGuest))

    async function performMoveConnection(connectionId: string, targetGroupId: string) {
        if (!canMutateConnectionCatalog(auth.isGuest)) {
            layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
            return
        }
        const connection = explorer.findNode(connectionId)
        const targetGroup = explorer.findNode(targetGroupId)
        if (!connection || connection.type !== 'connection') return
        if (!canMoveConnectionToGroup(explorer.tree, connectionId, targetGroupId)) return
        try {
            await explorer.moveConnection(connectionId, targetGroupId)
        } catch (error) {
            layout.showErrorToast(resolveConnectionCatalogErrorMessage(error, t, 'save'))
        }
    }

    async function performMoveProjectFile(sourceId: string, targetFolderId: string) {
        const source = explorer.findNode(sourceId)
        const target = explorer.findNode(targetFolderId)
        if (!source || !target) return
        if (!isProjectSandboxMovableNode(source)) return
        if (!canMoveProjectFileToFolder(explorer.tree, source, target)) {
            layout.showErrorToast(t('explorer.projectFiles.moveInvalid'))
            return
        }
        try {
            const result = await moveProjectFileNode(source, target)
            if (!result) {
                layout.showErrorToast(t('explorer.projectFiles.moveInvalid'))
                return
            }
            layout.showSuccessToast(t('explorer.projectFiles.moved', {name: result.name}))
            explorer.expandToNode(result.nodeId)
            explorer.selectNode(result.nodeId)
        } catch (error) {
            if (error instanceof Error && error.message === 'invalid_target') {
                layout.showErrorToast(t('explorer.projectFiles.moveInvalid'))
                return
            }
            layout.showErrorToast(
                resolveCaughtApiErrorMessage(error, t, 'explorer.projectFiles.moveFailed'),
            )
        }
    }

    async function performReorderCatalog(
        nodeId: string,
        targetId: string,
        position: 'before' | 'after' | 'inside',
    ) {
        const node = explorer.findNode(nodeId)
        const target = explorer.findNode(targetId)
        if (!node || !target) return

        if (isProjectSandboxMovableNode(node)) {
            const folderId = resolveProjectFileDropFolderId(explorer.tree, target, position)
            if (!folderId) return
            // Same-folder before/after is a no-op (filesystem has no sibling order).
            if (
                position !== 'inside'
                && findProjectFileParentFolderId(explorer.tree, nodeId) === folderId
            ) {
                return
            }
            await performMoveProjectFile(nodeId, folderId)
            return
        }

        if (!canMutateConnectionCatalog(auth.isGuest)) {
            layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
            return
        }
        if (node.type === 'connection' && position === 'inside') {
            if (!canMoveConnectionToGroup(explorer.tree, nodeId, targetId)) return
        }
        try {
            await explorer.reorderCatalogNode(nodeId, targetId, position)
        } catch (error) {
            layout.showErrorToast(resolveConnectionCatalogErrorMessage(error, t, 'save'))
        }
    }

    async function performMoveConnectionToProject(connectionId: string, targetProjectId: string) {
        if (!canMutateConnectionCatalog(auth.isGuest)) {
            layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
            return
        }
        const sourceProjectId = projectStore.activeProjectId
        if (!sourceProjectId || projectStore.apiUnavailable) {
            layout.showErrorToast(t('explorer.context.projectActionUnavailable'))
            return
        }
        const connection = explorer.findNode(connectionId)
        if (!connection || connection.type !== 'connection') return
        const target = projectStore.projects.find((p) => p.id === targetProjectId)
        try {
            await projectStore.moveConnections(sourceProjectId, [connectionId], targetProjectId)
            await explorer.refreshTree()
        } catch (error) {
            layout.showErrorToast(
                resolveCaughtApiErrorMessage(error, t, 'explorer.context.moveToProjectFailed'),
            )
        }
    }

    async function performShareConnectionToProject(connectionId: string, targetProjectId: string) {
        if (!canMutateConnectionCatalog(auth.isGuest)) {
            layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
            return
        }
        const sourceProjectId = projectStore.activeProjectId
        if (!sourceProjectId || projectStore.apiUnavailable) {
            layout.showErrorToast(t('explorer.context.projectActionUnavailable'))
            return
        }
        const connection = explorer.findNode(connectionId)
        if (!connection || connection.type !== 'connection') return
        const target = projectStore.projects.find((p) => p.id === targetProjectId)
        try {
            await projectStore.shareConnections(sourceProjectId, [connectionId], [targetProjectId])
        } catch (error) {
            layout.showErrorToast(
                resolveCaughtApiErrorMessage(error, t, 'explorer.context.shareToProjectFailed'),
            )
        }
    }

    return {
        connectionDragEnabled,
        performMoveConnection,
        performMoveProjectFile,
        performReorderCatalog,
        performMoveConnectionToProject,
        performShareConnectionToProject,
    }
}
