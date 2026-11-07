import type {TreeNode} from '@/core/types'
import {findAncestorByType} from '@/core/utils/tree'
import {resolveExplorerInstanceLabel} from '@/features/explorer/services/explorer-database-scope'

/** 从 Tab / 树节点 / 下拉实例解析库名，避免 activeInstance 未就绪时丢失 database 上下文 */
export function resolveConsoleInstanceLabel(options: {
    activeInstanceLabel?: string | null
    instanceId?: string | null
    tabInstanceId?: string | null
    tabDatabase?: string
    findNodeLabel: (nodeId: string) => string | undefined
    resolveScopedLabel?: (nodeId: string) => string | undefined
}): string | undefined {
    if (options.activeInstanceLabel?.trim()) {
        return options.activeInstanceLabel.trim()
    }
    const nodeId = options.instanceId ?? options.tabInstanceId
    if (nodeId) {
        const scoped = options.resolveScopedLabel?.(nodeId)
        if (scoped?.trim()) return scoped.trim()
        const label = options.findNodeLabel(nodeId)
        if (label?.trim()) return label.trim()
    }
    if (options.tabDatabase?.trim()) {
        return options.tabDatabase.trim()
    }
    return undefined
}

export function buildExplorerScopedLabelResolver(
    tree: TreeNode[],
    findNode: (nodeId: string) => TreeNode | null | undefined,
) {
    return (nodeId: string) => {
        const connection = findAncestorByType(tree, nodeId, 'connection')
        return resolveExplorerInstanceLabel(tree, nodeId, connection?.dbType)
    }
}
