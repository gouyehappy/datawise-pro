import type {DbType, TreeNode} from '@/core/types'

export function isSqlServerFamily(dbType?: DbType | string): boolean {
    const normalized = dbType?.toLowerCase()
    return normalized === 'sqlserver' || normalized === 'mssql'
}

/** API/Explorer instance key uses {@code catalog.schema} (Trino / Presto / Hive / SQL Server). */
export function usesCatalogSchemaInstanceKey(dbType?: DbType | string): boolean {
    return dbType === 'trino' || dbType === 'presto' || dbType === 'hive' || isSqlServerFamily(dbType)
}

/** @alias usesCatalogSchemaInstanceKey */
export const isCatalogSchemaDbType = usesCatalogSchemaInstanceKey

/** catalog 下应是 schema 节点，而非历史缓存里的 tables 文件夹 */
export function catalogNeedsSchemaReload(
    children: TreeNode[] | undefined,
    connectionDbType?: DbType | string,
): boolean {
    const nodes = children ?? []
    if (nodes.length === 0) return true
    if (nodes.some((child) => child.type === 'schema')) return false
    // Hive 扁平库：database 节点直接挂 tables/models/views 等 folder，不会再出现 schema 子级。
    if (connectionDbType === 'hive' && nodes.some((child) => child.type === 'folder')) {
        return false
    }
    return true
}
