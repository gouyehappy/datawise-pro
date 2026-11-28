import type {TreeNode} from '@/core/types'
import {resolveConnectionId} from '@/core/utils/tree'
import {instanceSqlApi} from '@/api'
import {resolveExplorerSqlFileScope} from '@/features/explorer/services/explorer-database-scope'
import {
    getCachedSqlScript,
    setCachedSqlScript,
    shouldPrefetchSqlScript,
    sqlScriptCacheKey,
    type SqlScriptCacheKey,
} from '@/features/explorer/services/sql-script-content-cache'

export type ReadSqlScriptResult = {
    sql: string
    fileName: string
    fromCache: boolean
}

/** Read script body: memory cache first, then API (and refresh cache). */
export async function readSqlScriptContent(
    parts: SqlScriptCacheKey,
    options?: {preferCache?: boolean},
): Promise<ReadSqlScriptResult> {
    const preferCache = options?.preferCache !== false
    if (preferCache) {
        const cached = getCachedSqlScript(parts)
        if (cached != null) {
            return {sql: cached, fileName: parts.fileName, fromCache: true}
        }
    }

    const result = await instanceSqlApi.read({
        connectionId: parts.connectionId,
        instanceName: parts.instanceName,
        fileName: parts.fileName,
    })
    setCachedSqlScript(
        {connectionId: parts.connectionId, instanceName: parts.instanceName, fileName: result.fileName},
        result.sql,
    )
    return {sql: result.sql, fileName: result.fileName, fromCache: false}
}

const prefetchInflight = new Set<string>()

/** Fire-and-forget prefetch for tree hover / scripts folder expand. */
export function prefetchSqlScriptContent(parts: SqlScriptCacheKey): void {
    if (!shouldPrefetchSqlScript()) return
    if (getCachedSqlScript(parts) != null) return
    const key = sqlScriptCacheKey(parts)
    if (prefetchInflight.has(key)) return
    prefetchInflight.add(key)
    void instanceSqlApi
        .read({
            connectionId: parts.connectionId,
            instanceName: parts.instanceName,
            fileName: parts.fileName,
        })
        .then((result) => {
            setCachedSqlScript(
                {
                    connectionId: parts.connectionId,
                    instanceName: parts.instanceName,
                    fileName: result.fileName,
                },
                result.sql,
            )
        })
        .catch(() => {
            // ignore prefetch errors
        })
        .finally(() => {
            prefetchInflight.delete(key)
        })
}

export function prefetchSqlScriptsInFolder(
    connectionId: string,
    instanceName: string,
    fileNames: string[],
    options?: {limit?: number},
): void {
    const limit = options?.limit ?? 8
    let scheduled = 0
    for (const fileName of fileNames) {
        if (scheduled >= limit) break
        if (!fileName.toLowerCase().endsWith('.sql')) continue
        if (getCachedSqlScript({connectionId, instanceName, fileName}) != null) continue
        prefetchSqlScriptContent({connectionId, instanceName, fileName})
        scheduled += 1
    }
}

/** Prefetch after scripts / workspaces folder expand (or when children are already loaded). */
export function prefetchSqlScriptsForExplorerFolder(
    tree: TreeNode[],
    folder: TreeNode,
    options?: {limit?: number},
): void {
    const label = folder.label.toLowerCase()
    if (label !== 'scripts' && label !== 'workspaces') return
    const connectionId = resolveConnectionId(tree, folder.id)
    if (!connectionId) return

    const childSql = (folder.children ?? []).find((child) => child.type === 'sql_file')
    const scope = resolveExplorerSqlFileScope(tree, childSql?.id ?? folder.id)
    if (!scope) return

    prefetchSqlScriptsInFolder(
        connectionId,
        scope.instanceLabel,
        (folder.children ?? []).filter((c) => c.type === 'sql_file').map((c) => c.label),
        options,
    )
}

/** Prefetch a single tree sql_file (hover / select). */
export function prefetchSqlScriptFromTreeNode(tree: TreeNode[], node: TreeNode): void {
    if (node.type !== 'sql_file') return
    if (node.id.startsWith('project-file:')) return
    const connectionId = resolveConnectionId(tree, node.id)
    if (!connectionId) return
    const scope = resolveExplorerSqlFileScope(tree, node.id)
    if (!scope) return
    prefetchSqlScriptContent({
        connectionId,
        instanceName: scope.instanceLabel,
        fileName: node.label,
    })
}
