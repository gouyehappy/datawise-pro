import type {DbType, TreeNode} from '@/core/types'
import {findAncestorByType, findNodeById} from '@/core/utils/tree'
import {isCatalogSchemaDbType} from '@/shared/db-type-families'

export interface ExplorerDatabaseScope {
    catalog: string
    schema?: string
    label: string
}

export interface ExplorerCatalogSchemaIndex {
    catalogs: string[]
    schemasByCatalog: Record<string, string[]>
}

export function parseExplorerDatabaseScope(
    dbType: DbType | undefined,
    label: string,
): ExplorerDatabaseScope {
    const trimmed = label.trim()
    if (!trimmed) {
        return {catalog: '', label: ''}
    }
    if (isCatalogSchemaDbType(dbType) && trimmed.includes('.')) {
        const dot = trimmed.indexOf('.')
        return {
            catalog: trimmed.slice(0, dot),
            schema: trimmed.slice(dot + 1),
            label: trimmed,
        }
    }
    return {catalog: trimmed, label: trimmed}
}

export function formatExplorerDatabaseScope(
    dbType: DbType | undefined,
    catalog: string,
    schema?: string,
): string {
    if (isCatalogSchemaDbType(dbType) && schema?.trim()) {
        return `${catalog}.${schema}`
    }
    return catalog
}

/** workspaces / SQL 脚本绑定的实例名（Trino 为 catalog.schema） */
export function resolveExplorerInstanceLabel(
    tree: TreeNode[],
    nodeId: string,
    dbType?: DbType,
): string | undefined {
    const node = findNodeById(tree, nodeId)
    if (!node) return undefined
    if (node.type === 'schema') {
        const catalogNode = findAncestorByType(tree, node.id, 'database')
        if (catalogNode && isCatalogSchemaDbType(dbType)) {
            return formatExplorerDatabaseScope(dbType, catalogNode.label, node.label)
        }
        return node.label
    }
    if (node.type === 'database') {
        return node.label
    }
    return undefined
}

export interface ExplorerSqlFileScope {
    scopeNode: TreeNode
    instanceLabel: string
}

/** 从 sql_file 节点向上解析 scope（Trino 优先 schema，MySQL 为 database） */
export function resolveExplorerSqlFileScope(
    tree: TreeNode[],
    sqlFileNodeId: string,
): ExplorerSqlFileScope | null {
    const schemaNode = findAncestorByType(tree, sqlFileNodeId, 'schema')
    const databaseNode = findAncestorByType(tree, sqlFileNodeId, 'database')
    const scopeNode = schemaNode ?? databaseNode
    if (!scopeNode) return null

    const connection = findAncestorByType(tree, scopeNode.id, 'connection')
    const instanceLabel =
        resolveExplorerInstanceLabel(tree, scopeNode.id, connection?.dbType) ?? scopeNode.label
    return {scopeNode, instanceLabel}
}

export function findExplorerScopeNode(
    connection: TreeNode,
    dbType: DbType | undefined,
    databaseName: string,
): TreeNode | null {
    const scope = parseExplorerDatabaseScope(dbType, databaseName)
    if (!scope.catalog) return null

    const catalogNode = connection.children?.find(
        (node) =>
            node.type === 'database'
            && node.label.localeCompare(scope.catalog, undefined, {sensitivity: 'accent'}) === 0,
    )
    if (!catalogNode) return null

    if (isCatalogSchemaDbType(dbType) && scope.schema) {
        return catalogNode.children?.find(
            (node) =>
                node.type === 'schema'
                && node.label.localeCompare(scope.schema!, undefined, {sensitivity: 'accent'}) === 0,
        ) ?? null
    }
    return catalogNode
}

export function findExplorerTablesFolder(scopeNode: TreeNode | null): TreeNode | null {
    if (!scopeNode) return null
    if (scopeNode.type === 'schema' || scopeNode.type === 'database') {
        return scopeNode.children?.find((node) => node.type === 'folder' && node.label === 'tables') ?? null
    }
    return null
}

export function readExplorerCatalogSchemaIndex(
    connection: TreeNode,
    dbType: DbType | undefined,
): ExplorerCatalogSchemaIndex {
    if (!isCatalogSchemaDbType(dbType)) {
        const catalogs = (connection.children ?? [])
            .filter((node) => node.type === 'database')
            .map((node) => node.label)
        return {catalogs, schemasByCatalog: {}}
    }

    const catalogs: string[] = []
    const schemasByCatalog: Record<string, string[]> = {}
    for (const catalogNode of connection.children ?? []) {
        if (catalogNode.type !== 'database') continue
        catalogs.push(catalogNode.label)
        const schemas = (catalogNode.children ?? [])
            .filter((node) => node.type === 'schema')
            .map((node) => node.label)
        schemasByCatalog[catalogNode.label] = schemas
    }
    return {catalogs, schemasByCatalog}
}

export function listExplorerDatabaseInstances(
    connection: TreeNode,
    dbType: DbType | undefined,
): { id: string; label: string }[] {
    if (!isCatalogSchemaDbType(dbType)) {
        return (connection.children ?? [])
            .filter((node) => node.type === 'database')
            .map((node) => ({id: node.id, label: node.label}))
    }

    const instances: { id: string; label: string }[] = []
    for (const catalogNode of connection.children ?? []) {
        if (catalogNode.type !== 'database') continue
        const schemaNodes = (catalogNode.children ?? []).filter((node) => node.type === 'schema')
        if (schemaNodes.length) {
            for (const schemaNode of schemaNodes) {
                instances.push({
                    id: schemaNode.id,
                    label: formatExplorerDatabaseScope(dbType, catalogNode.label, schemaNode.label),
                })
            }
            continue
        }
        instances.push({id: catalogNode.id, label: catalogNode.label})
    }
    return instances
}
