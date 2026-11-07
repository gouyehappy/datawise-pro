import type {TreeNode} from '@/core/types'

/** 数据源树中允许勾选的节点类型（仅 AI 多选模式） */
export const SCOPE_TREE_SELECTABLE_TYPES = new Set<TreeNode['type']>([
    'connection',
    'database',
    'table',
])

export function isScopeSelectableNode(node: TreeNode): boolean {
    return SCOPE_TREE_SELECTABLE_TYPES.has(node.type)
}
