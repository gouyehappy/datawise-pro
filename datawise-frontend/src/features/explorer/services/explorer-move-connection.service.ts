import type {ContextMenuItem, TreeNode} from '@/core/types'
import {findParentNode, walkTree} from '@/core/utils/tree'

export const MOVE_TARGET_MENU_PREFIX = 'move-to:'

export interface ConnectionMoveTarget {
    id: string
    label: string
    depth: number
}

export function toMoveTargetMenuId(groupId: string): string {
    return `${MOVE_TARGET_MENU_PREFIX}${groupId}`
}

export function parseMoveTargetMenuId(menuId: string): string | null {
    if (!menuId.startsWith(MOVE_TARGET_MENU_PREFIX)) return null
    const groupId = menuId.slice(MOVE_TARGET_MENU_PREFIX.length)
    return groupId || null
}

export function findConnectionParentGroupId(tree: TreeNode[], connectionId: string): string | null {
    const parent = findParentNode(tree, connectionId)
    return parent?.type === 'group' ? parent.id : null
}

export function canMoveConnectionToGroup(
    tree: TreeNode[],
    connectionId: string,
    targetGroupId: string,
): boolean {
    const currentGroupId = findConnectionParentGroupId(tree, connectionId)
    if (!currentGroupId || currentGroupId === targetGroupId) return false
    let found = false
    walkTree(tree, (node) => {
        if (node.type === 'group' && node.id === targetGroupId) {
            found = true
            return true
        }
    })
    return found
}

/** 列出可移动到的目录（排除当前所在目录） */
export function listConnectionMoveTargets(
    tree: TreeNode[],
    connectionId: string,
): ConnectionMoveTarget[] {
    const currentGroupId = findConnectionParentGroupId(tree, connectionId)
    const targets: ConnectionMoveTarget[] = []
    walkTree(tree, (node, parents) => {
        if (node.type !== 'group') return
        if (node.id === currentGroupId) return
        targets.push({
            id: node.id,
            label: node.label,
            depth: parents.filter((item) => item.type === 'group').length,
        })
    })
    return targets
}

export function formatMoveTargetMenuLabel(target: ConnectionMoveTarget): string {
    if (target.depth <= 0) return target.label
    return `${'\u2003'.repeat(target.depth)}${target.label}`
}

export function buildMoveTargetMenuChildren(targets: ConnectionMoveTarget[]): ContextMenuItem[] {
    return targets.map((target) => ({
        id: toMoveTargetMenuId(target.id),
        label: formatMoveTargetMenuLabel(target),
        icon: 'file' as const,
    }))
}

export function injectConnectionMoveSubmenu(
    items: ContextMenuItem[],
    targets: ConnectionMoveTarget[],
    moveLabel: string,
): ContextMenuItem[] {
    const moveItem: ContextMenuItem = targets.length
        ? {
            id: 'move',
            label: moveLabel,
            icon: 'file',
            children: buildMoveTargetMenuChildren(targets),
        }
        : {
            id: 'move',
            label: moveLabel,
            icon: 'file',
            disabled: true,
        }
    const index = items.findIndex((item) => item.id === 'move')
    if (index < 0) return [...items, moveItem]
    const next = [...items]
    next[index] = moveItem
    return next
}
