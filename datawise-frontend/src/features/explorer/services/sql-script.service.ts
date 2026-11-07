import type {InstanceSqlFileItem} from '@/api'
import {instanceSqlApi} from '@/api'
import type {TreeNode} from '@/core/types'
import {findNodeById} from '@/core/utils/tree'
import {findExplorerScopeNode} from '@/features/explorer/services/explorer-database-scope'
import {isCatalogSchemaDbType} from '@/features/explorer/services/explorer-lazy-load'
import {listSqlFileNodesUnderDatabase} from '@/features/explorer/services/explorer-locate.service'
import {nextScriptFileName} from '@/features/explorer/services/sql-script-naming'
import {
    mergeConsoleScriptFileNames,
    resolveNextConsoleScriptFileName,
} from '@/features/workspace/services/console-tab-title'

export {nextScriptFileName}

function findConnectionNode(tree: TreeNode[], connectionId: string): TreeNode | null {
    for (const root of tree) {
        if (root.id === connectionId && root.type === 'connection') return root
        const stack = [...(root.children ?? [])]
        while (stack.length) {
            const node = stack.pop()!
            if (node.id === connectionId && node.type === 'connection') return node
            if (node.children?.length) stack.push(...node.children)
        }
    }
    return null
}

function findScopeNodeForScripts(
    tree: TreeNode[],
    connectionId: string,
    options?: { instanceId?: string | null; database?: string },
): TreeNode | null {
    const connection = findConnectionNode(tree, connectionId)
    if (!connection) return null

    if (options?.instanceId) {
        const byId = findNodeById(tree, options.instanceId)
        if (
            byId
            && (byId.type === 'database' || byId.type === 'schema')
            && resolveConnectionIdForNode(tree, byId.id) === connectionId
        ) {
            return byId
        }
    }

    const database = options?.database?.trim()
    if (!database) return null

    if (isCatalogSchemaDbType(connection.dbType) && database.includes('.')) {
        return findExplorerScopeNode(connection, connection.dbType, database)
    }

    return connection.children?.find(
        (node) => node.type === 'database' && node.label === database,
    ) ?? null
}

function resolveConnectionIdForNode(tree: TreeNode[], nodeId: string): string | null {
    let found: string | null = null
    const walk = (nodes: TreeNode[], parents: TreeNode[]) => {
        for (const node of nodes) {
            if (node.id === nodeId) {
                const connection = [...parents].reverse().find((item) => item.type === 'connection')
                found = connection?.id ?? null
                return true
            }
            if (node.children?.length && walk(node.children, [...parents, node])) {
                return true
            }
        }
        return false
    }
    walk(tree, [])
    return found
}

function findDatabaseNode(
    tree: TreeNode[],
    connectionId: string,
    options?: { instanceId?: string | null; database?: string },
): TreeNode | null {
    return findScopeNodeForScripts(tree, connectionId, options)
}

export function listWorkspaceScriptFileNamesFromTree(
    tree: TreeNode[],
    connectionId: string,
    options?: { instanceId?: string | null; database?: string },
): string[] {
    const databaseNode = findDatabaseNode(tree, connectionId, options)
    if (!databaseNode) return []
    return listSqlFileNodesUnderDatabase(databaseNode).map((node) => node.label)
}

/** 新建 Tab：优先读 workspaces 磁盘列表，再合并已打开 Tab 的预占编号 */
export async function resolveNextScriptFileForOpen(options: {
    tabs: {
        id?: string
        type?: string
        connectionId?: string
        instanceId?: string | null
        sqlFile?: string | null
        title?: string
    }[]
    connectionId: string
    instanceId?: string | null
    instanceName?: string
    tree?: TreeNode[]
    excludeTabId?: string
}): Promise<string> {
    const treeNames = options.tree
        ? listWorkspaceScriptFileNamesFromTree(options.tree, options.connectionId, {
            instanceId: options.instanceId,
            database: options.instanceName,
        })
        : []

    let diskFileNames = treeNames
    const instanceName = options.instanceName?.trim()
    if (instanceName) {
        try {
            const scripts = await instanceSqlApi.listScripts({
                connectionId: options.connectionId,
                instanceName,
            })
            diskFileNames = mergeConsoleScriptFileNames(
                treeNames,
                scripts.map((item) => item.fileName),
            ).map((item) => item.fileName)
        } catch {
            diskFileNames = treeNames
        }
    }

    return resolveNextConsoleScriptFileName({
        tabs: options.tabs,
        connectionId: options.connectionId,
        instanceId: options.instanceId,
        diskFileNames,
        excludeTabId: options.excludeTabId,
    })
}

export async function listInstanceSqlScripts(options: {
    connectionId: string
    instanceName: string
    allConnections?: boolean
}) {
    return instanceSqlApi.listScripts({
        connectionId: options.connectionId,
        instanceName: options.instanceName,
        allConnections: options.allConnections ?? false,
    })
}

export async function createEmptySqlScript(options: {
    connectionId: string
    instanceId?: string
    instanceName: string
    fileName: string
}) {
    return instanceSqlApi.createEmptyScript(options)
}

export function formatScriptModifiedTime(modifiedAt: number): string {
    const date = new Date(modifiedAt)
    const pad = (value: number, size = 2) => String(value).padStart(size, '0')
    const ms = pad(date.getMilliseconds(), 3)
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
        + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${ms}`
}

export async function resolveNextConsoleScriptFile(options: {
    connectionId: string
    instanceName: string
}) {
    return instanceSqlApi.resolveNextScriptFile(options)
}

export async function deleteInstanceSqlScript(options: {
    connectionId: string
    instanceName: string
    fileName: string
}) {
    return instanceSqlApi.delete(options)
}

export function filterSqlScripts(
    scripts: InstanceSqlFileItem[],
    query: string,
): InstanceSqlFileItem[] {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return scripts
    return scripts.filter((item) => {
        const haystack = [
            item.fileName,
            item.instanceName,
            item.preview,
            item.connectionId,
        ]
            .join(' ')
            .toLowerCase()
        return haystack.includes(keyword)
    })
}
