import type {TreeNode} from '@/core/types'
import type {SqlColumnMeta, SqlForeignKey} from '@datawise/sql-editor/types'
import {runWithConcurrencyLimit} from '@/core/utils/concurrency-limit'
import type {useExplorerStore} from '@/features/explorer/stores/explorer'
import {
    findExplorerScopeNode,
    findExplorerTablesFolder,
    parseExplorerDatabaseScope,
    readExplorerCatalogSchemaIndex,
    type ExplorerCatalogSchemaIndex,
} from '@/features/explorer/services/explorer-database-scope'
import {isCatalogSchemaDbType, resolveConnectionDbType} from '@/features/explorer/services/explorer-lazy-load'

type ExplorerStore = ReturnType<typeof useExplorerStore>

function readTableIndex(tablesFolder: TreeNode | null): {
    tables: string[]
    tableIds: Record<string, string>
    tableComments: Record<string, string>
} {
    const tableNodes = tablesFolder?.children?.filter((node) => node.type === 'table') ?? []
    const tables = tableNodes.map((node) => node.label)
    const tableIds = Object.fromEntries(tableNodes.map((node) => [node.label, node.id]))
    const tableComments: Record<string, string> = {}
    for (const node of tableNodes) {
        const comment = node.comment?.trim()
        if (comment) tableComments[node.label] = comment
    }
    return {tables, tableIds, tableComments}
}

function readColumnMeta(node: TreeNode): SqlColumnMeta {
    const meta = node.meta ?? ''
    const pk = /\bpk\b/i.test(meta) || node.type === 'primary_key'
    const type = meta.replace(/\s*·?\s*pk\s*/gi, '').trim() || undefined
    return {
        name: node.label,
        type: type || undefined,
        pk: pk || undefined,
        comment: node.comment,
    }
}

function readTableColumns(table: TreeNode | null): SqlColumnMeta[] {
    const columnsFolder = table?.children?.find((node) => node.type === 'columns')
    return columnsFolder?.children
        ?.filter((node) => node.type === 'column' || node.type === 'primary_key')
        .map(readColumnMeta) ?? []
}

function parseForeignKeyMeta(meta: string | undefined): { toTable: string; toColumn: string } | null {
    if (!meta) return null
    const match = /^([\w.]+)\.([\w$]+)$/i.exec(meta.trim())
    if (!match) return null
    const tablePart = match[1]
    const dot = tablePart.lastIndexOf('.')
    const toTable = dot >= 0 ? tablePart.slice(dot + 1) : tablePart
    return {toTable, toColumn: match[2]}
}

function readForeignKeys(table: TreeNode | null, tableName: string): SqlForeignKey[] {
    const keysFolder = table?.children?.find((node) => node.type === 'keys')
    const nodes = keysFolder?.children?.filter((node) => node.type === 'foreign_key') ?? []
    const result: SqlForeignKey[] = []
    for (const node of nodes) {
        const ref = parseForeignKeyMeta(node.meta)
        if (!ref) continue
        result.push({
            fromTable: tableName,
            fromColumn: node.label,
            toTable: ref.toTable,
            toColumn: ref.toColumn,
        })
    }
    return result
}

export interface SqlTableLoadResult {
    columns: SqlColumnMeta[]
    foreignKeys: SqlForeignKey[]
}

/** 补全预加载 catalog 子节点时的并发上限 */
const CATALOG_CHILD_LOAD_CONCURRENCY = 3

/** 懒加载 catalog / schema 索引，供 SQL 编辑器补全 */
export async function ensureCatalogSchemaIndexLoaded(
    explorer: ExplorerStore,
    connectionId: string,
): Promise<ExplorerCatalogSchemaIndex> {
    await explorer.ensureChildrenLoaded(connectionId)
    const connection = explorer.findNode(connectionId)
    if (!connection) {
        return {catalogs: [], schemasByCatalog: {}}
    }
    const dbType = resolveConnectionDbType(explorer.tree, connectionId) ?? connection.dbType
    const catalogNodes = (connection.children ?? []).filter((catalogNode) => catalogNode.type === 'database')
    await runWithConcurrencyLimit(catalogNodes, CATALOG_CHILD_LOAD_CONCURRENCY, async (catalogNode) => {
        await explorer.ensureChildrenLoaded(catalogNode.id)
    })
    const refreshed = explorer.findNode(connectionId)
    if (!refreshed) {
        return {catalogs: [], schemasByCatalog: {}}
    }
    return readExplorerCatalogSchemaIndex(refreshed, dbType)
}

/** 懒加载当前连接 / 库下的全部表 */
export async function ensureDatabaseTablesLoaded(
    explorer: ExplorerStore,
    connectionId: string,
    databaseName: string,
): Promise<{
    tables: string[]
    tableIds: Record<string, string>
    catalog?: string
    tableComments?: Record<string, string>
}> {
    await explorer.ensureChildrenLoaded(connectionId)

    let connection = explorer.findNode(connectionId)
    if (!connection) return {tables: [], tableIds: {}}

    const dbType = resolveConnectionDbType(explorer.tree, connectionId) ?? connection.dbType
    const scope = parseExplorerDatabaseScope(dbType, databaseName)

    let catalogNode = connection.children?.find(
        (node) =>
            node.type === 'database'
            && node.label.localeCompare(scope.catalog, undefined, {sensitivity: 'accent'}) === 0,
    )
    if (catalogNode && isCatalogSchemaDbType(dbType) && scope.schema) {
        await explorer.ensureChildrenLoaded(catalogNode.id)
        connection = explorer.findNode(connectionId)
        if (!connection) return {tables: [], tableIds: {}}
    }

    let scopeNode = connection ? findExplorerScopeNode(connection, dbType, databaseName) : null
    if (!scopeNode) return {tables: [], tableIds: {}}

    await explorer.ensureChildrenLoaded(scopeNode.id)

    connection = explorer.findNode(connectionId)
    scopeNode = connection ? findExplorerScopeNode(connection, dbType, databaseName) : null
    if (!scopeNode) return {tables: [], tableIds: {}}

    let tablesFolder = findExplorerTablesFolder(scopeNode)
    if (tablesFolder) {
        await explorer.ensureChildrenLoaded(tablesFolder.id)
        connection = explorer.findNode(connectionId)
        scopeNode = connection ? findExplorerScopeNode(connection, dbType, databaseName) : null
        tablesFolder = findExplorerTablesFolder(scopeNode)
    }

    const index = readTableIndex(tablesFolder)
    return {
        ...index,
        catalog: scope.label || scope.schema ? scope.label : scope.catalog,
    }
}

/** 懒加载单表列信息与外键 */
export async function ensureTableColumnsLoaded(
    explorer: ExplorerStore,
    tableId: string,
): Promise<SqlTableLoadResult> {
    await explorer.ensureChildrenLoaded(tableId)

    let table = explorer.findNode(tableId)
    const tableName = table?.label ?? ''
    let columns = readTableColumns(table)
    let foreignKeys = readForeignKeys(table, tableName)

    const columnsFolder = table?.children?.find((node) => node.type === 'columns')
    if (columnsFolder && !columns.length) {
        await explorer.ensureChildrenLoaded(columnsFolder.id)
        table = explorer.findNode(tableId)
        columns = readTableColumns(table)
    }

    const keysFolder = table?.children?.find((node) => node.type === 'keys')
    if (keysFolder && !foreignKeys.length && !keysFolder.children?.length) {
        await explorer.ensureChildrenLoaded(keysFolder.id)
        table = explorer.findNode(tableId)
        foreignKeys = readForeignKeys(table, table?.label ?? tableName)
    } else if (keysFolder?.children?.length) {
        foreignKeys = readForeignKeys(table, table?.label ?? tableName)
    }

    return {columns, foreignKeys}
}
