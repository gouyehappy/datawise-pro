import type {DbType, TreeNode} from '@/core/types'
import {walkTree} from '@/core/utils/tree'
import {needsLazyLoad} from '@/features/explorer/services/explorer-lazy-load'

/** 从根到目标节点的 id 链（含目标） */
export function collectPathNodeIds(tree: TreeNode[], nodeId: string): string[] {
    const path: string[] = []
    walkTree(tree, (node, parents) => {
        if (node.id === nodeId) {
            path.push(...parents.map((item) => item.id), node.id)
            return true
        }
    })
    return path
}

/** 节点子级是否已加载完毕（与 expanded 无关） */
export function isNodeChildrenLoaded(node: TreeNode, dbType?: DbType): boolean {
    return !needsLazyLoad(node, dbType)
}

/**
 * 箭头切换：已展开且子级已加载时折叠。
 * 已展开但没有任何子节点时也折叠——避免「箭头朝开、下面却是空的」卡死
 * （空 lazy folder 在 BUG-004 下仍 needsLazyLoad=true，否则永远无法收起）。
 */
export function shouldCollapseOnToggle(node: TreeNode, dbType?: DbType): boolean {
    if (!node.expanded) return false
    if (!node.children?.length) return true
    return isNodeChildrenLoaded(node, dbType)
}

/** Twistie 视觉态：仅在确实有可见子节点（或正在加载）时显示为展开 */
export function isTreeTwistVisuallyExpanded(
    node: Pick<TreeNode, 'expanded' | 'children'>,
    options?: {loading?: boolean},
): boolean {
    if (!node.expanded) return false
    if (options?.loading) return true
    return Boolean(node.children?.length)
}

/** 行单击不展开；展开/加载仅由左侧箭头触发 */
export function shouldLoadOnNodeSelect(_node: TreeNode, _dbType?: DbType): boolean {
    return false
}

/** 是否需要对该节点执行懒加载（expand 与 load 解耦后的统一判断） */
export function shouldLoadChildren(node: TreeNode, dbType?: DbType): boolean {
    return needsLazyLoad(node, dbType)
}

/** 展开路径上哪些节点需要 load（group 等静态节点跳过 API） */
export function pathIdsNeedingLoad(
    tree: TreeNode[],
    nodeId: string,
    resolveDbType: (id: string) => DbType | undefined,
): string[] {
    return collectPathNodeIds(tree, nodeId).filter((id) => {
        const node = findNodeInTree(tree, id)
        if (!node) return false
        return shouldLoadChildren(node, resolveDbType(id))
    })
}

function findNodeInTree(tree: TreeNode[], nodeId: string): TreeNode | null {
    let found: TreeNode | null = null
    walkTree(tree, (node) => {
        if (node.id === nodeId) {
            found = node
            return true
        }
    })
    return found
}

/** 仅设置 expanded 标记，不触发 API（用于 group 等静态节点） */
export function markExpandedPath(tree: TreeNode[], nodeId: string) {
    walkTree(tree, (node, parents) => {
        if (node.id === nodeId) {
            for (const parent of parents) {
                if (!parent.expanded) parent.expanded = true
            }
            return true
        }
    })
}
