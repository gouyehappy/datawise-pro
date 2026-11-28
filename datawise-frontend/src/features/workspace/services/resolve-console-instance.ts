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
    /**
     * 资源树定位场景：连接级 scripts / ai 是树里真实存在的目录（磁盘实例 `_scripts`），
     * 必须保留才能定位到目录下的脚本文件节点。默认 false 维持"仅 JDBC catalog"语义
     * （保存等其它链路不应把 scripts 当成数据库名）。
     */
    keepConnectionScope?: boolean
}): string | undefined {
    const normalize = (label: string): string | undefined =>
        options.keepConnectionScope ? label.trim() || undefined : asJdbcDatabase(label)
    if (options.activeInstanceLabel?.trim()) {
        return normalize(options.activeInstanceLabel)
    }
    const nodeId = options.instanceId ?? options.tabInstanceId
    if (nodeId) {
        const scoped = options.resolveScopedLabel?.(nodeId)
        if (scoped?.trim()) return normalize(scoped)
        const label = options.findNodeLabel(nodeId)
        if (label?.trim()) return normalize(label)
    }
    if (options.tabDatabase?.trim()) {
        return normalize(options.tabDatabase)
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
