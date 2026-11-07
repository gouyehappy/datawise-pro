import type {TreeNode, WorkspaceTab} from '@/core/types'
import {walkTree} from '@/core/utils/tree'
import {buildWorkspaceSqlFileNodeId} from '@/features/explorer/services/workspace-sql-file-node-id'
import {resolveSqlFileForLocate} from '@/features/workspace/services/console-tab-title'
import {resolveConsoleInstanceLabel} from '@/features/workspace/services/resolve-console-instance'
import {
    isProjectFileUri,
    resolveProjectFileNodeIdFromUri,
} from '@/features/project/services/project-files-api'

function findFolderChild(databaseNode: TreeNode, folderLabel: string): TreeNode | undefined {
    return databaseNode.children?.find(
        (child) => child.type === 'folder' && child.label.toLowerCase() === folderLabel.toLowerCase(),
    )
}

export function findTableNodeUnderDatabase(
    databaseNode: TreeNode,
    tableName: string,
): TreeNode | null {
    const trimmed = tableName.trim()
    if (!trimmed) return null

    const tablesFolder = findFolderChild(databaseNode, 'tables')
    const searchRoots = tablesFolder?.children?.length
        ? tablesFolder.children
        : databaseNode.children ?? []

    let found: TreeNode | null = null
    walkTree(searchRoots, (node) => {
        if (node.type === 'table' && node.label === trimmed) {
            found = node
            return true
        }
    })
    return found
}

export function listSqlFileNodesUnderDatabase(databaseNode: TreeNode): TreeNode[] {
    const workspacesFolder = findFolderChild(databaseNode, 'workspaces')
    if (workspacesFolder) {
        return (workspacesFolder.children ?? []).filter((node) => node.type === 'sql_file')
    }
    if (databaseNode.type === 'folder' && databaseNode.label.toLowerCase() === 'scripts') {
        return (databaseNode.children ?? []).filter((node) => node.type === 'sql_file')
    }
    return []
}

export function findSqlFileNodeUnderDatabase(
    databaseNode: TreeNode,
    fileName: string,
): TreeNode | null {
    const trimmed = fileName.trim()
    if (!trimmed) return null

    const matches = listSqlFileNodesUnderDatabase(databaseNode).filter(
        (node) => node.label.toLowerCase() === trimmed.toLowerCase(),
    )
    return matches.length === 1 ? matches[0] : null
}

export function resolveSqlFileNodeForLocate(
    databaseNode: TreeNode,
    connectionId: string,
    instanceLabel: string,
    fileName: string,
): TreeNode | null {
    const trimmed = fileName.trim()
    if (!trimmed) return null

    const files = listSqlFileNodesUnderDatabase(databaseNode)
    const expectedId = buildWorkspaceSqlFileNodeId(connectionId, instanceLabel, trimmed)
    const byId = files.find((node) => node.id === expectedId)
    if (byId) return byId

    return findSqlFileNodeUnderDatabase(databaseNode, trimmed)
}

export function countTreeNodesWithId(tree: TreeNode[], nodeId: string): number {
    let count = 0
    walkTree(tree, (node) => {
        if (node.id === nodeId) count += 1
    })
    return count
}

/** Project sandbox tabs live under「项目文档/脚本」in the database explorer — not local Files. */
export function resolveProjectSandboxTabLocateUri(tab: WorkspaceTab | null): string | null {
    if (!tab) return null
    if (tab.type === 'local-text' && isProjectFileUri(tab.localFilePath)) {
        return tab.localFilePath!.trim()
    }
    if (tab.type === 'console' && isProjectFileUri(tab.sqlFile)) {
        return tab.sqlFile!.trim()
    }
    return null
}

export function resolveActiveTabLocateNodeId(
    activeTab: WorkspaceTab | null,
    options: {
        findNode: (nodeId: string) => TreeNode | null
        findDatabaseNode: (
            connectionId: string,
            instanceLabel: string,
            instanceId?: string | null,
        ) => TreeNode | null
        findNodeLabel: (nodeId: string) => string | undefined
        findTableNodeGlobal: (tableName: string) => string | null
    },
): string | null {
    if (!activeTab) return null

    const projectUri = resolveProjectSandboxTabLocateUri(activeTab)
    if (projectUri) {
        const fromUri = resolveProjectFileNodeIdFromUri(projectUri)
        if (fromUri) return fromUri
    }

    if (activeTab.type === 'console' && activeTab.connectionId) {
        const instanceLabel = resolveConsoleInstanceLabel({
            tabInstanceId: activeTab.instanceId,
            tabDatabase: activeTab.database,
            findNodeLabel: options.findNodeLabel,
        })
        if (instanceLabel) {
            const databaseNode = options.findDatabaseNode(
                activeTab.connectionId,
                instanceLabel,
                activeTab.instanceId,
            )
            if (databaseNode) {
                const sqlFile = resolveSqlFileForLocate(activeTab)
                if (sqlFile) {
                    const sqlNode = resolveSqlFileNodeForLocate(
                        databaseNode,
                        activeTab.connectionId,
                        instanceLabel,
                        sqlFile,
                    )
                    if (sqlNode) return sqlNode.id

                    return buildWorkspaceSqlFileNodeId(
                        activeTab.connectionId,
                        instanceLabel,
                        sqlFile,
                    )
                }
                const pinnedId = activeTab.explorerNodeId?.trim()
                if (pinnedId) {
                    const pinned = options.findNode(pinnedId)
                    if (pinned?.type === 'sql_file') {
                        return pinnedId
                    }
                }
                return databaseNode.id
            }
        }
        return activeTab.connectionId
    }

    const pinnedId = activeTab.explorerNodeId?.trim()
    if (pinnedId && options.findNode(pinnedId)) {
        return pinnedId
    }

    if (activeTab.type === 'table') {
        const tableName = activeTab.tableName?.trim()
        if (activeTab.connectionId && tableName) {
            const databaseLabel =
                activeTab.database?.trim()
                ?? (activeTab.instanceId
                    ? options.findNodeLabel(activeTab.instanceId)?.trim()
                    : undefined)
            if (databaseLabel) {
                const databaseNode = options.findDatabaseNode(
                    activeTab.connectionId,
                    databaseLabel,
                    activeTab.instanceId,
                )
                if (databaseNode) {
                    const tableNode = findTableNodeUnderDatabase(databaseNode, tableName)
                    if (tableNode) return tableNode.id
                }
            }
            return options.findTableNodeGlobal(tableName) ?? activeTab.connectionId
        }
        if (tableName) {
            return options.findTableNodeGlobal(tableName) ?? activeTab.connectionId ?? null
        }
        return activeTab.connectionId ?? null
    }

    if (activeTab.connectionId) return activeTab.connectionId
    return null
}

export function resolveLocateFolderForNode(
    node: TreeNode,
): 'tables' | 'workspaces' | null {
    switch (node.type) {
        case 'table':
            return 'tables'
        case 'sql_file':
            return 'workspaces'
        default:
            return null
    }
}
