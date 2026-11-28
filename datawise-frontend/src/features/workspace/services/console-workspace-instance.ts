import type {DbType, TreeNode} from '@/core/types'
import {findNodeById} from '@/core/utils/tree'
import {
    findExplorerScopeNode,
} from '@/features/explorer/services/explorer-database-scope'
import {isCatalogSchemaDbType} from '@/features/explorer/services/explorer-lazy-load'

/**
 * 跨 catalog 引擎（Trino / Presto / Hive / SQL Server）的控制台脚本固定落盘实例。
 * Explorer 连接根下的 scripts 文件夹对应此目录，不再按 SQL / 选中 schema 散落到 catalog.schema。
 */
export const TRINO_CONNECTION_SCRIPTS_INSTANCE = '_scripts'

const TRINO_THREE_PART =
    /\b([a-zA-Z_][\w]*)\s*\.\s*([a-zA-Z_][\w]*)\s*\.\s*([a-zA-Z_][\w]*)\b/g

/** 从 SQL 解析第一个 catalog.schema（如 kudu.a003.hh_15 → kudu.a003）；定位用，不参与保存路径 */
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

/**
 * 控制台 Save 的工作区实例名。
 * - 普通库：绑定的 database 名
 * - catalog.schema 族：固定 `_scripts`（连接级 scripts），避免跨库 SQL 把文件写到各 schema 下
 */
export function resolveConsoleWorkspaceInstance(options: {
    dbType?: DbType
    sql: string
    tabDatabase?: string
    tree: TreeNode[]
    connectionId: string
    selectedNodeId?: string | null
    findNode?: (nodeId: string) => TreeNode | null | undefined
}): string | undefined {
    if (isCatalogSchemaDbType(options.dbType)) {
        return TRINO_CONNECTION_SCRIPTS_INSTANCE
    }

    const bound = options.tabDatabase?.trim()
    return bound || undefined
}

/** 连接级 scripts 文件夹（磁盘 instance = `_scripts`） */
export function findConnectionScriptsFolder(connection: TreeNode): TreeNode | null {
    return connection.children?.find(
        (node) =>
            node.type === 'folder'
            && node.label.localeCompare('scripts', undefined, {sensitivity: 'accent'}) === 0,
    ) ?? null
}

export function isConnectionScriptsInstance(instanceName?: string | null): boolean {
    const trimmed = instanceName?.trim()
    if (!trimmed) return false
    return trimmed === TRINO_CONNECTION_SCRIPTS_INSTANCE
        || trimmed.localeCompare('scripts', undefined, {sensitivity: 'accent'}) === 0
}

export function resolveWorkspaceInstanceNodeId(
    tree: TreeNode[],
    connectionId: string,
    instanceName: string,
    dbType?: DbType,
): string | null {
    const connection = findNodeById(tree, connectionId)
    if (!connection) return null

    if (isCatalogSchemaDbType(dbType) && isConnectionScriptsInstance(instanceName)) {
        return findConnectionScriptsFolder(connection)?.id ?? null
    }

    if (!isCatalogSchemaDbType(dbType)) {
        return connection.children?.find(
            (node) => node.type === 'database' && node.label === instanceName,
        )?.id ?? null
    }

    return findExplorerScopeNode(connection, dbType, instanceName)?.id ?? null
}
