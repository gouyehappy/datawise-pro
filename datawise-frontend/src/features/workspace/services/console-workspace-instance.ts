import type {DbType, TreeNode} from '@/core/types'
import {findNodeById} from '@/core/utils/tree'
import {
    findExplorerScopeNode,
    resolveExplorerInstanceLabel,
} from '@/features/explorer/services/explorer-database-scope'
import {isCatalogSchemaDbType} from '@/features/explorer/services/explorer-lazy-load'

/** Trino 连接级脚本目录（无 catalog.schema 上下文时） */
export const TRINO_CONNECTION_SCRIPTS_INSTANCE = '_scripts'

const TRINO_THREE_PART =
    /\b([a-zA-Z_][\w]*)\s*\.\s*([a-zA-Z_][\w]*)\s*\.\s*([a-zA-Z_][\w]*)\b/g

/** 从 SQL 解析第一个 catalog.schema（如 kudu.a003.hh_15 → kudu.a003） */
export function parseTrinoCatalogSchemaFromSql(sql: string): string | null {
    const text = sql.trim()
    if (!text) return null

    TRINO_THREE_PART.lastIndex = 0
    const match = TRINO_THREE_PART.exec(text)
    if (!match) return null

    const catalog = match[1]
    const schema = match[2]
    if (!catalog || !schema) return null
    return `${catalog}.${schema}`
}

export function resolveConsoleWorkspaceInstance(options: {
    dbType?: DbType
    sql: string
    tabDatabase?: string
    tree: TreeNode[]
    connectionId: string
    selectedNodeId?: string | null
    findNode?: (nodeId: string) => TreeNode | null | undefined
}): string | undefined {
    const bound = options.tabDatabase?.trim()
    if (!isCatalogSchemaDbType(options.dbType)) {
        return bound || undefined
    }

    if (bound?.includes('.')) {
        return bound
    }

    const findNode = options.findNode ?? ((id: string) => findNodeById(options.tree, id))
    const selectedId = options.selectedNodeId
    if (selectedId) {
        const selected = findNode(selectedId)
        if (selected?.type === 'schema') {
            const scoped = resolveExplorerInstanceLabel(options.tree, selected.id, options.dbType)
            if (scoped?.includes('.')) return scoped
        }
        if (selected?.type === 'database') {
            const catalog = selected.label
            const schemaFromSql = parseTrinoCatalogSchemaFromSql(options.sql)
            if (schemaFromSql?.startsWith(`${catalog}.`)) {
                return schemaFromSql
            }
        }
    }

    const fromSql = parseTrinoCatalogSchemaFromSql(options.sql)
    if (fromSql) return fromSql

    if (bound) {
        return TRINO_CONNECTION_SCRIPTS_INSTANCE
    }

    return TRINO_CONNECTION_SCRIPTS_INSTANCE
}

export function resolveWorkspaceInstanceNodeId(
    tree: TreeNode[],
    connectionId: string,
    instanceName: string,
    dbType?: DbType,
): string | null {
    const connection = findNodeById(tree, connectionId)
    if (!connection) return null

    if (!isCatalogSchemaDbType(dbType)) {
        return connection.children?.find(
            (node) => node.type === 'database' && node.label === instanceName,
        )?.id ?? null
    }

    return findExplorerScopeNode(connection, dbType, instanceName)?.id ?? null
}
