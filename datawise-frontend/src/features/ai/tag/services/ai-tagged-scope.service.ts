import type {DbType, TreeNode} from '@/core/types'
import {collectSearchTreeVisibility, findNodeById, flattenVisibleTree, walkTree} from '@/core/utils/tree'
import type {AiTaggedScopeGroup, AiTableTagCatalogItem} from '@/features/ai/tag/types/ai-table-tag.types'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'

function resolveConnectionMeta(
    tree: TreeNode[],
    connectionId: string,
    connectionName: string,
): {dbType: DbType; groupLabel: string} {
    const node = findNodeById(tree, connectionId)
    let groupLabel = ''
    walkTree(tree, (current, parents) => {
        if (current.id !== connectionId) return
        groupLabel = parents.find((item) => item.type === 'group')?.label ?? ''
        return true
    })
    return {
        dbType: node?.dbType ?? 'mysql',
        groupLabel,
    }
}

export function buildAiTaggedScopeGroups(
    catalog: AiTableTagCatalogItem[],
    tree: TreeNode[],
): AiTaggedScopeGroup[] {
    const map = new Map<string, AiTaggedScopeGroup>()

    for (const item of catalog) {
        const key = `${item.connectionId}|${item.database}`
        const existing = map.get(key)
        if (existing) {
            if (!existing.tables.includes(item.tableName)) {
                existing.tables.push(item.tableName)
            }
            continue
        }
        const {dbType, groupLabel} = resolveConnectionMeta(tree, item.connectionId, item.connectionName)
        map.set(key, {
            key,
            connectionId: item.connectionId,
            connectionLabel: item.connectionName,
            database: item.database,
            databaseLabel: item.database,
            dbType,
            groupLabel,
            tables: [item.tableName],
        })
    }

    return Array.from(map.values())
        .map((group) => ({
            ...group,
            tables: [...group.tables].sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'})),
        }))
        .sort((a, b) => {
            const byConn = a.connectionLabel.localeCompare(b.connectionLabel, undefined, {sensitivity: 'base'})
            if (byConn !== 0) return byConn
            return a.databaseLabel.localeCompare(b.databaseLabel, undefined, {sensitivity: 'base'})
        })
}

export function buildAiTargetFromTaggedTable(group: AiTaggedScopeGroup, tableName: string): AiDatabaseTarget {
    return {
        id: `${group.connectionId}:${group.database}:${tableName}`,
        connectionId: group.connectionId,
        connectionLabel: group.connectionLabel,
        databaseId: group.database,
        databaseLabel: group.databaseLabel,
        tableId: tableName,
        tableLabel: tableName,
        level: 'table',
        dbType: group.dbType,
        groupLabel: group.groupLabel,
    }
}

export function buildAiTargetsFromTaggedCatalog(
    catalog: AiTableTagCatalogItem[],
    tree: TreeNode[],
): AiDatabaseTarget[] {
    return buildAiTaggedScopeGroups(catalog, tree).flatMap((group) =>
        group.tables.map((tableName) => buildAiTargetFromTaggedTable(group, tableName)),
    )
}

export function matchesTaggedScopeSearch(group: AiTaggedScopeGroup, tableName: string, query: string): boolean {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return true
    return [
        group.connectionLabel,
        group.databaseLabel,
        tableName,
        group.groupLabel,
    ].some((value) => value.toLowerCase().includes(normalized))
}

export function buildAiTaggedScopeTree(groups: AiTaggedScopeGroup[]): TreeNode[] {
    const byConnection = new Map<string, {
        connectionId: string
        connectionLabel: string
        dbType: DbType
        databases: AiTaggedScopeGroup[]
    }>()

    for (const group of groups) {
        const existing = byConnection.get(group.connectionId)
        if (existing) {
            existing.databases.push(group)
            continue
        }
        byConnection.set(group.connectionId, {
            connectionId: group.connectionId,
            connectionLabel: group.connectionLabel,
            dbType: group.dbType,
            databases: [group],
        })
    }

    return Array.from(byConnection.values())
        .sort((a, b) => a.connectionLabel.localeCompare(b.connectionLabel, undefined, {sensitivity: 'base'}))
        .map((connection) => ({
            id: `aitag-c:${connection.connectionId}`,
            label: connection.connectionLabel,
            type: 'connection' as const,
            dbType: connection.dbType,
            expanded: true,
            children: [...connection.databases]
                .sort((a, b) => a.databaseLabel.localeCompare(b.databaseLabel, undefined, {sensitivity: 'base'}))
                .map((group) => ({
                    id: `aitag-d:${group.connectionId}:${group.database}`,
                    label: group.databaseLabel,
                    type: 'database' as const,
                    dbType: group.dbType,
                    expanded: true,
                    children: group.tables.map((tableName) => ({
                        id: buildAiTargetFromTaggedTable(group, tableName).id,
                        label: tableName,
                        type: 'table' as const,
                        dbType: group.dbType,
                    })),
                })),
        }))
}

export function matchesAiTaggedScopeTreeSearch(node: TreeNode, query: string): boolean {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return true
    return node.label.toLowerCase().includes(normalized)
}

function applyAiTaggedScopeExpansion(nodes: TreeNode[], collapsedIds: ReadonlySet<string>): TreeNode[] {
    return nodes.map((node) => ({
        ...node,
        expanded: node.type === 'table' ? undefined : !collapsedIds.has(node.id),
        children: node.children?.length
            ? applyAiTaggedScopeExpansion(node.children, collapsedIds)
            : node.children,
    }))
}

export function buildAiTaggedScopeFlatNodes(
    groups: AiTaggedScopeGroup[],
    search: string,
    collapsedIds: ReadonlySet<string>,
): {node: TreeNode; depth: number}[] {
    const tree = applyAiTaggedScopeExpansion(buildAiTaggedScopeTree(groups), collapsedIds)
    const query = search.trim()
    const visibility = query
        ? collectSearchTreeVisibility(tree, query, matchesAiTaggedScopeTreeSearch)
        : null
    return flattenVisibleTree(tree, 0, visibility)
}
