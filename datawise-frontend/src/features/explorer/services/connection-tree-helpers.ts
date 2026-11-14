import type {ContextMenuItem, TreeNode} from '@/core/types'
import {findParentConnectionId} from '@/core/utils/tree'

/** Resolve owning connection id for an explorer tree node. */
export function resolveConnectionIdFromTree(
    tree: TreeNode[],
    nodeId: string,
): string | undefined {
    return findParentConnectionId(tree, nodeId) ?? undefined
}

/** Connection display label from explorer tree lookup. */
export function resolveConnectionLabel(
    findNode: (id: string) => TreeNode | undefined | null,
    connectionId?: string,
): string | undefined {
    if (!connectionId) return undefined
    return findNode(connectionId)?.label
}

/** Map project-files hint node to its real folder node. */
export function resolveProjectFilesActionFolder(
    node: TreeNode,
    findNode: (id: string) => TreeNode | undefined | null,
): TreeNode {
    if (node.type !== 'project-files-hint') return node
    const parentId = parseProjectFilesHintParentId(node.id)
    return (parentId && findNode(parentId)) || node
}

/** Parent folder id encoded in a `project-files-hint:` node id. */
export function parseProjectFilesHintParentId(nodeId: string): string {
    return nodeId.startsWith('project-files-hint:')
        ? nodeId.slice('project-files-hint:'.length)
        : ''
}

/**
 * True when rename/delete project-file actions should be hidden
 * (hint nodes / virtual docs|scripts roots, not real sandbox paths).
 */
export function shouldOmitRenameProjectFileMenuItem(
    node: Pick<TreeNode, 'id' | 'type'>,
): boolean {
    if (node.type === 'project-files-hint') return true
    if (
        (node.type === 'project-docs' || node.type === 'project-scripts')
        && !node.id.startsWith('project-file:')
    ) {
        return true
    }
    return false
}

/** Drop rename/delete project-file items when the node is not a real project path. */
export function filterRenameProjectFileMenuItems(
    node: Pick<TreeNode, 'id' | 'type'>,
    items: ContextMenuItem[],
): ContextMenuItem[] {
    if (!shouldOmitRenameProjectFileMenuItem(node)) return items
    return items.filter(
        (item) =>
            item.id !== 'rename-project-file'
            && item.id !== 'delete-project-file'
            && item.id !== 'move-project-file',
    )
}

/** Prefer human-readable fields from community plugin invoke payloads. */
export function communityInvokeMessage(result: unknown): string | null {
    if (!result || typeof result !== 'object') return null
    const record = result as Record<string, unknown>
    for (const key of ['message', 'detail', 'status'] as const) {
        const value = record[key]
        if (typeof value === 'string' && value.trim()) return value
    }
    return null
}
