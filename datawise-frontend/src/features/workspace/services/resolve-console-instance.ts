import type {TreeNode} from '@/core/types'
import {findAncestorByType} from '@/core/utils/tree'
import {resolveExplorerInstanceLabel} from '@/features/explorer/services/explorer-database-scope'
import {isConnectionScriptsInstance} from '@/features/workspace/services/console-workspace-instance'

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
        return asJdbcDatabase(options.activeInstanceLabel.trim())
    }
    const nodeId = options.instanceId ?? options.tabInstanceId
    if (nodeId) {
        const scoped = options.resolveScopedLabel?.(nodeId)
        if (scoped?.trim()) return asJdbcDatabase(scoped.trim())
        const label = options.findNodeLabel(nodeId)
        if (label?.trim()) return asJdbcDatabase(label.trim())
    }
    if (options.tabDatabase?.trim()) {
        return asJdbcDatabase(options.tabDatabase.trim())
    }
    return undefined
}

/** 连接级 scripts / AI 是文件或平台目录名，不是 JDBC catalog */
function asJdbcDatabase(label: string): string | undefined {
    const trimmed = label.trim()
    if (!trimmed) return undefined
    if (isConnectionScriptsInstance(trimmed)) return undefined
    if (trimmed === '_connection') return undefined
    return trimmed
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
