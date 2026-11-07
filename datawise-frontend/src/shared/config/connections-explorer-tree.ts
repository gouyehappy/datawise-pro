import type {ConnectionConfig, DbType, TreeNode} from '@/core/types'
import {filterConnectionSchemaChildren} from '@/shared/explorer/flat-connection-catalog'
import {normalizeConnectionsCatalog} from '@/shared/config/connections-catalog-normalize'
import type {
    ConnectionEntryRecord,
    ConnectionGroupRecord,
    ConnectionsCatalog,
} from '@/shared/config/connections-catalog.types'

function groupChildrenByParent(groups: ConnectionGroupRecord[]) {
    const map = new Map<string, ConnectionGroupRecord[]>()
    for (const group of groups) {
        const key = group.parentId?.trim() ? group.parentId : ''
        const bucket = map.get(key) ?? []
        bucket.push(group)
        map.set(key, bucket)
    }
    for (const bucket of map.values()) {
        bucket.sort((a, b) => a.sortOrder - b.sortOrder)
    }
    return map
}

function connectionsByGroup(connections: ConnectionEntryRecord[]) {
    const map = new Map<string, ConnectionEntryRecord[]>()
    for (const entry of connections) {
        const bucket = map.get(entry.groupId) ?? []
        bucket.push(entry)
        map.set(entry.groupId, bucket)
    }
    for (const bucket of map.values()) {
        bucket.sort((a, b) => a.sortOrder - b.sortOrder)
    }
    return map
}

function buildGroupNode(
    group: ConnectionGroupRecord,
    groupsByParent: Map<string, ConnectionGroupRecord[]>,
    connectionMap: Map<string, ConnectionEntryRecord[]>,
    schemaByConnectionId: Map<string, TreeNode[]>,
): TreeNode {
    const children: TreeNode[] = []
    for (const child of groupsByParent.get(group.id) ?? []) {
        children.push(buildGroupNode(child, groupsByParent, connectionMap, schemaByConnectionId))
    }
    for (const entry of connectionMap.get(group.id) ?? []) {
        const config = entry.config
        children.push({
            id: entry.id,
            label: config.name || entry.id,
            type: 'connection',
            dbType: config.dbType as DbType,
            env: config.env,
            envCustom: config.envCustom,
            database: config.database?.trim() || undefined,
            expanded: false,
            children: filterConnectionSchemaChildren(
                config.dbType as DbType,
                schemaByConnectionId.get(entry.id) ?? [],
            ),
        })
    }
    return {
        id: group.id,
        label: group.label,
        type: 'group',
        expanded: false, // 展开态由 app-config 会话恢复，不读 catalog
        children,
    }
}

export function extractSchemaChildrenByConnection(tree: TreeNode[]): Map<string, TreeNode[]> {
    const map = new Map<string, TreeNode[]>()
    for (const root of tree) {
        walk(root)
    }
    return map

    function walk(node: TreeNode) {
        if (node.type === 'connection' && node.children?.length) {
            map.set(node.id, node.children.map(cloneSubtree))
        }
        for (const child of node.children ?? []) {
            walk(child)
        }
    }
}

function cloneSubtree(node: TreeNode): TreeNode {
    return {
        ...node,
        children: node.children?.map(cloneSubtree),
    }
}

/** 将服务端 Explorer 树与本地已加载的 schema 子节点合并。 */
export function applyExplorerTreeStructure(
    nextRoots: TreeNode[],
    previousTree: TreeNode[] = [],
): TreeNode[] {
    const schemaByConnectionId = extractSchemaChildrenByConnection(previousTree)
    return graftSchemaChildren(nextRoots, schemaByConnectionId)
}

function graftSchemaChildren(
    nodes: TreeNode[],
    schemaByConnectionId: Map<string, TreeNode[]>,
): TreeNode[] {
    return nodes.map((node) => {
        if (node.type === 'connection') {
            const preserved = schemaByConnectionId.get(node.id)
            if (!preserved?.length) {
                return {...node, children: node.children ?? []}
            }
            return {
                ...node,
                children: filterConnectionSchemaChildren(node.dbType as DbType, preserved),
            }
        }
        return {
            ...node,
            children: node.children?.length
                ? graftSchemaChildren(node.children, schemaByConnectionId)
                : [],
        }
    })
}

export function buildExplorerTreeFromCatalog(
    catalog: ConnectionsCatalog,
    previousTree: TreeNode[] = [],
): TreeNode[] {
    const safeCatalog = normalizeConnectionsCatalog(catalog)
    const groupsByParent = groupChildrenByParent(safeCatalog.groups)
    const connectionMap = connectionsByGroup(safeCatalog.connections)
    const schemaByConnectionId = extractSchemaChildrenByConnection(previousTree)
    const roots = groupsByParent.get('') ?? []
    return roots.map((group) =>
        buildGroupNode(group, groupsByParent, connectionMap, schemaByConnectionId),
    )
}

export function findConnectionConfigInCatalog(
    catalog: ConnectionsCatalog,
    connectionId: string,
): ConnectionConfig | null {
    const entry = catalog.connections.find((item) => item.id === connectionId)
    if (!entry) return null
    return {...entry.config, id: entry.id}
}
