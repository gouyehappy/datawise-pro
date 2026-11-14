/**
 * Explorer locate / flash / reveal domain (FE-P0-3 store).
 * Factory over shared store refs — `useExplorerStore` remains the public facade.
 */
import {ref, type Ref, type ShallowRef} from 'vue'
import type {TreeNode, WorkspaceTab} from '@/core/types'
import {walkTree} from '@/core/utils/tree'
import {scrollExplorerNodeIntoView} from '@/core/shortcuts/action-registry'
import {resolveConsoleInstanceLabel, buildExplorerScopedLabelResolver} from '@/features/workspace/services/resolve-console-instance'
import {findExplorerTablesFolder} from '@/features/explorer/services/explorer-database-scope'
import {needsLazyLoad, resolveConnectionDbType} from '@/features/explorer/services/explorer-lazy-load'
import {
    resolveActiveTabLocateNodeId as resolveLocateNodeId,
    resolveLocateFolderForNode,
    resolveProjectSandboxTabLocateUri,
    countTreeNodesWithId,
} from '@/features/explorer/services/explorer-locate.service'
import {resolveSqlFileForLocate} from '@/features/workspace/services/console-tab-title'
import {listProjectFileAncestorFolderIds} from '@/features/project/services/project-explorer-files'

export type ExplorerLocateDomainDeps = {
    tree: ShallowRef<TreeNode[]>
    searchQuery: Ref<string>
    selectedNodeId: Ref<string | null>
    findNode: (nodeId: string) => TreeNode | null
    selectNode: (nodeId: string) => void
    touchTree: () => void
    /** Late-bound: lives in lazy-load domain. */
    findDatabaseNode: (
        connectionId: string,
        instanceLabel: string,
        instanceId?: string | null,
    ) => TreeNode | null
    ensureChildrenLoaded: (nodeId: string, options?: {notify?: boolean}) => Promise<void>
    expandPathToNode: (nodeId: string, options?: {notify?: boolean}) => Promise<void>
    reloadWorkspacesFolder: (
        connectionId: string,
        instanceLabel: string,
        instanceId?: string | null,
    ) => Promise<void>
}

export function createExplorerLocateDomain(deps: ExplorerLocateDomainDeps) {
    const flashNodeId = ref<string | null>(null)
    let flashTimer: ReturnType<typeof setTimeout> | null = null

    function locatePathNeedsFetch(activeTab: WorkspaceTab): boolean {
        if (!activeTab.connectionId) return false

        const conn = deps.findNode(activeTab.connectionId)
        if (conn && needsLazyLoad(conn, conn.dbType)) return true

        if (activeTab.type !== 'console' && activeTab.type !== 'table') return false

        const databaseLabel =
            activeTab.type === 'table'
                ? activeTab.database?.trim()
                ?? (activeTab.instanceId
                    ? deps.findNode(activeTab.instanceId)?.label?.trim()
                    : undefined)
                : resolveConsoleInstanceLabel({
                    tabInstanceId: activeTab.instanceId,
                    tabDatabase: activeTab.database,
                    findNodeLabel: (nodeId) => deps.findNode(nodeId)?.label,
                    resolveScopedLabel: buildExplorerScopedLabelResolver(deps.tree.value, deps.findNode),
                })

        if (!databaseLabel) return false

        const databaseNode = deps.findDatabaseNode(
            activeTab.connectionId,
            databaseLabel,
            activeTab.instanceId,
        )
        if (!databaseNode) return true
        const connectionDbType = resolveConnectionDbType(deps.tree.value, activeTab.connectionId)
        if (needsLazyLoad(databaseNode, connectionDbType)) return true

        const needsFolder =
            activeTab.type === 'table'
                ? !!activeTab.tableName?.trim()
                : !!resolveSqlFileForLocate(activeTab)
        if (!needsFolder) return false

        const folderLabel = activeTab.type === 'table' ? 'tables' : 'workspaces'
        const folder =
            folderLabel === 'tables'
                ? findExplorerTablesFolder(databaseNode)
                : databaseNode.children?.find(
                    (child) => child.type === 'folder' && child.label.toLowerCase() === folderLabel,
                )
        if (!folder) return true
        return needsLazyLoad(folder, connectionDbType)
    }

    function findTableNodeId(tableName: string): string | null {
        let found: string | null = null
        walkTree(deps.tree.value, (node) => {
            if (node.type === 'table' && node.label === tableName) {
                found = node.id
                return true
            }
        })
        return found
    }

    function resolveActiveTabLocateNodeId(activeTab: WorkspaceTab | null): string | null {
        return resolveLocateNodeId(activeTab, {
            findNode: deps.findNode,
            findDatabaseNode: deps.findDatabaseNode,
            findNodeLabel: (nodeId) => deps.findNode(nodeId)?.label,
            findTableNodeGlobal: findTableNodeId,
        })
    }

    async function ensureDatabaseBranchLoaded(
        connectionId: string,
        instanceLabel: string,
        instanceId?: string | null,
    ): Promise<TreeNode | null> {
        await deps.ensureChildrenLoaded(connectionId)
        const databaseNode = deps.findDatabaseNode(connectionId, instanceLabel, instanceId)
        if (!databaseNode) return null
        await deps.ensureChildrenLoaded(databaseNode.id)
        if (!databaseNode.expanded) {
            databaseNode.expanded = true
            deps.touchTree()
        }
        return deps.findDatabaseNode(connectionId, instanceLabel, instanceId)
    }

    async function ensureFolderBranchLoaded(
        connectionId: string,
        databaseNode: TreeNode,
        folderLabel: 'tables' | 'workspaces',
    ) {
        const folder = databaseNode.children?.find(
            (child) => child.type === 'folder' && child.label.toLowerCase() === folderLabel,
        )
        if (!folder) return
        await deps.ensureChildrenLoaded(folder.id)
        if (!folder.expanded) {
            folder.expanded = true
            deps.touchTree()
        }
    }

    async function ensureLocatePathLoaded(activeTab: WorkspaceTab): Promise<void> {
        if (!activeTab.connectionId) return

        const pinnedId = activeTab.explorerNodeId?.trim()
        const pinnedNode = pinnedId ? deps.findNode(pinnedId) : null
        const folderLabel = pinnedNode ? resolveLocateFolderForNode(pinnedNode) : null

        if (activeTab.type === 'console') {
            const instanceLabel = resolveConsoleInstanceLabel({
                tabInstanceId: activeTab.instanceId,
                tabDatabase: activeTab.database,
                findNodeLabel: (nodeId) => deps.findNode(nodeId)?.label,
                resolveScopedLabel: buildExplorerScopedLabelResolver(deps.tree.value, deps.findNode),
            })
            if (!instanceLabel) {
                await deps.ensureChildrenLoaded(activeTab.connectionId)
                return
            }
            const databaseNode = await ensureDatabaseBranchLoaded(
                activeTab.connectionId,
                instanceLabel,
                activeTab.instanceId,
            )
            if (!databaseNode) return
            const needsWorkspaces =
                folderLabel === 'workspaces'
                || !!resolveSqlFileForLocate(activeTab)
            if (needsWorkspaces) {
                await ensureFolderBranchLoaded(activeTab.connectionId, databaseNode, 'workspaces')
            }
            return
        }

        if (activeTab.type === 'table' && activeTab.tableName?.trim()) {
            const databaseLabel =
                activeTab.database?.trim()
                ?? (activeTab.instanceId
                    ? deps.findNode(activeTab.instanceId)?.label?.trim()
                    : undefined)
            if (!databaseLabel) {
                await deps.ensureChildrenLoaded(activeTab.connectionId)
                return
            }
            const databaseNode = await ensureDatabaseBranchLoaded(
                activeTab.connectionId,
                databaseLabel,
                activeTab.instanceId,
            )
            if (!databaseNode) return
            if (folderLabel === 'tables' || activeTab.tableName.trim()) {
                await ensureFolderBranchLoaded(activeTab.connectionId, databaseNode, 'tables')
            }
            return
        }

        await deps.ensureChildrenLoaded(activeTab.connectionId)
    }

    async function ensureProjectSandboxLocatePath(uri: string): Promise<void> {
        for (const folderId of listProjectFileAncestorFolderIds(uri)) {
            await deps.ensureChildrenLoaded(folderId)
            const folder = deps.findNode(folderId)
            if (folder && !folder.expanded) {
                folder.expanded = true
                deps.touchTree()
            }
        }
    }

    async function resolveActiveTabLocateNodeIdAsync(
        activeTab: WorkspaceTab | null,
    ): Promise<string | null> {
        if (!activeTab) return null

        const projectUri = resolveProjectSandboxTabLocateUri(activeTab)
        if (projectUri) {
            await ensureProjectSandboxLocatePath(projectUri)
            return resolveActiveTabLocateNodeId(activeTab)
        }

        const cachedTargetId = resolveActiveTabLocateNodeId(activeTab)
        if (cachedTargetId && deps.findNode(cachedTargetId) && !locatePathNeedsFetch(activeTab)) {
            return cachedTargetId
        }

        if (activeTab.connectionId && (activeTab.type === 'console' || activeTab.type === 'table')) {
            await ensureLocatePathLoaded(activeTab)
        } else if (activeTab.connectionId) {
            await deps.ensureChildrenLoaded(activeTab.connectionId)
        }
        return resolveActiveTabLocateNodeId(activeTab)
    }

    function triggerFlash(nodeId: string) {
        if (flashTimer) clearTimeout(flashTimer)
        flashNodeId.value = nodeId
        flashTimer = setTimeout(() => {
            flashNodeId.value = null
            flashTimer = null
        }, 700)
    }

    function clearFlash() {
        if (flashTimer) clearTimeout(flashTimer)
        flashTimer = null
        flashNodeId.value = null
    }

    async function revealNode(nodeId: string, options?: {select?: boolean}): Promise<TreeNode | null> {
        const node = deps.findNode(nodeId)
        if (!node) return null
        const wasSelected = deps.selectedNodeId.value === nodeId
        if (deps.searchQuery.value.trim()) deps.searchQuery.value = ''
        await deps.expandPathToNode(nodeId)
        if (options?.select !== false) deps.selectNode(nodeId)
        if (!wasSelected) triggerFlash(nodeId)
        scrollExplorerNodeIntoView(nodeId)
        return node
    }

    async function locateActiveTabNode(activeTab: WorkspaceTab | null): Promise<TreeNode | null> {
        let nodeId = await resolveActiveTabLocateNodeIdAsync(activeTab)
        if (!nodeId) return null

        if (
            activeTab?.type === 'console'
            && activeTab.connectionId
            && resolveSqlFileForLocate(activeTab)
            && countTreeNodesWithId(deps.tree.value, nodeId) > 1
        ) {
            const instanceLabel = resolveConsoleInstanceLabel({
                tabInstanceId: activeTab.instanceId,
                tabDatabase: activeTab.database,
                findNodeLabel: (id) => deps.findNode(id)?.label,
                resolveScopedLabel: buildExplorerScopedLabelResolver(deps.tree.value, deps.findNode),
            })
            if (instanceLabel) {
                await deps.reloadWorkspacesFolder(activeTab.connectionId, instanceLabel, activeTab.instanceId)
                nodeId = await resolveActiveTabLocateNodeIdAsync(activeTab)
                if (!nodeId) return null
            }
        }

        return revealNode(nodeId, {select: true})
    }

    async function locateSelectedNode(): Promise<TreeNode | null> {
        if (!deps.selectedNodeId.value) return null
        return revealNode(deps.selectedNodeId.value, {select: false})
    }

    async function locateNode(nodeId: string): Promise<TreeNode | null> {
        return revealNode(nodeId, {select: true})
    }

    return {
        flashNodeId,
        locatePathNeedsFetch,
        findTableNodeId,
        resolveActiveTabLocateNodeId,
        ensureDatabaseBranchLoaded,
        ensureFolderBranchLoaded,
        ensureLocatePathLoaded,
        ensureProjectSandboxLocatePath,
        resolveActiveTabLocateNodeIdAsync,
        revealNode,
        locateActiveTabNode,
        locateSelectedNode,
        triggerFlash,
        locateNode,
        clearFlash,
    }
}

export type ExplorerLocateDomain = ReturnType<typeof createExplorerLocateDomain>
