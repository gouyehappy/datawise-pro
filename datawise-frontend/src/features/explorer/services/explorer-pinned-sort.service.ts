import type {TreeNode} from '@/core/types'
import {readPinnedExplorerNodeIds} from '@/features/explorer/services/pinned-explorer-nodes.service'

/** 支持置顶排序的节点类型（数据源 / 库 / Schema / 表） */
export function isPinnableExplorerNode(node: Pick<TreeNode, 'type'>): boolean {
    return node.type === 'connection'
        || node.type === 'database'
        || node.type === 'schema'
        || node.type === 'table'
}

/** i18n key for pin/unpin success toast (schema uses database keys, matching prior UI). */
export function resolvePinToastMessageKey(
    nodeType: TreeNode['type'],
    pinned: boolean,
): string {
    if (nodeType === 'table') {
        return pinned ? 'explorer.tableFavorited' : 'explorer.tableUnfavorited'
    }
    if (nodeType === 'connection') {
        return pinned ? 'explorer.connectionPinned' : 'explorer.connectionUnpinned'
    }
    return pinned ? 'explorer.databasePinned' : 'explorer.databaseUnpinned'
}

/** 该父节点的子级列表是否应按置顶排序 */
export function shouldSortChildrenByPinned(parent: Pick<TreeNode, 'type' | 'label'>): boolean {
    if (parent.type === 'group' || parent.type === 'connection' || parent.type === 'database') return true
    return parent.type === 'folder' && parent.label === 'tables'
}

/** True when a tree label matches the connection form default database / schema. */
export function matchesConfiguredDatabaseLabel(
    label: string | undefined | null,
    configuredDatabase?: string | null,
): boolean {
    const name = label?.trim()
    const configured = configuredDatabase?.trim()
    if (!name || !configured) return false
    if (name === configured) return true
    if (name.toLowerCase() === configured.toLowerCase()) return true
    const dot = configured.indexOf('.')
    if (dot > 0) {
        const catalog = configured.slice(0, dot).trim()
        if (!catalog) return false
        if (name === catalog) return true
        if (name.toLowerCase() === catalog.toLowerCase()) return true
    }
    return false
}

export function isConfiguredDefaultDatabaseNode(
    node: Pick<TreeNode, 'type' | 'label'>,
    configuredDatabase?: string | null,
): boolean {
    if (node.type !== 'database' && node.type !== 'schema') return false
    return matchesConfiguredDatabaseLabel(node.label, configuredDatabase)
}

/**
 * Place the connection-form default database after user pins (or at the front when none).
 * Does not reorder when the match is already pinned.
 */
export function promoteConfiguredDatabaseAfterPinned(
    children: TreeNode[],
    configuredDatabase?: string | null,
    pinnedIds: readonly string[] = [],
): TreeNode[] {
    const configured = configuredDatabase?.trim()
    if (!configured || children.length < 2) return children

    const matchIndex = children.findIndex((child) =>
        isConfiguredDefaultDatabaseNode(child, configured),
    )
    if (matchIndex < 0) return children

    const pinnedSet = new Set(pinnedIds)
    if (pinnedSet.has(children[matchIndex].id)) return children

    let insertAt = 0
    while (insertAt < children.length && pinnedSet.has(children[insertAt].id)) {
        insertAt += 1
    }
    if (matchIndex === insertAt) return children

    const next = children.slice()
    const [match] = next.splice(matchIndex, 1)
    next.splice(insertAt, 0, match)
    return next
}

export function sortGroupChildrenByPinned(
    children: TreeNode[],
    pinnedIds: readonly string[] = readPinnedExplorerNodeIds(),
): TreeNode[] {
    const groups = children.filter((child) => child.type === 'group')
    const connections = children.filter((child) => child.type === 'connection')
    const rest = children.filter((child) => child.type !== 'group' && child.type !== 'connection')
    if (connections.length < 2) return children
    return [...groups, ...sortExplorerChildrenByPinned(connections, pinnedIds), ...rest]
}

/** 置顶项在前（按置顶顺序），其余按名称排序 */
export function sortExplorerChildrenByPinned(
    children: TreeNode[],
    pinnedIds: readonly string[] = readPinnedExplorerNodeIds(),
): TreeNode[] {
    if (!pinnedIds.length || children.length < 2) return children

    const pinnedOrder = new Map(pinnedIds.map((id, index) => [id, index]))
    const pinned: TreeNode[] = []
    const unpinned: TreeNode[] = []

    for (const child of children) {
        if (pinnedOrder.has(child.id)) {
            pinned.push(child)
        } else {
            unpinned.push(child)
        }
    }

    if (!pinned.length) return children

    pinned.sort((a, b) => (pinnedOrder.get(a.id) ?? 0) - (pinnedOrder.get(b.id) ?? 0))
    unpinned.sort((a, b) => a.label.localeCompare(b.label, undefined, {sensitivity: 'base'}))
    return [...pinned, ...unpinned]
}

export function applyPinnedSortToNodeChildren(node: TreeNode): void {
    if (!node.children?.length || !shouldSortChildrenByPinned(node)) return
    if (node.type === 'group') {
        node.children = sortGroupChildrenByPinned(node.children, readPinnedExplorerNodeIds())
        return
    }
    const pinnedIds = readPinnedExplorerNodeIds()
    let children = sortExplorerChildrenByPinned(node.children, pinnedIds)
    if (node.type === 'connection') {
        children = promoteConfiguredDatabaseAfterPinned(children, node.database, pinnedIds)
    }
    node.children = children
}

export function applyPinnedSortInTree(nodes: TreeNode[]): void {
    for (const node of nodes) {
        applyPinnedSortToNodeChildren(node)
        if (node.children?.length) {
            applyPinnedSortInTree(node.children)
        }
    }
}
