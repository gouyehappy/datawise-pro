import type {TreeNode} from '@/core/types'
import {canExpandTreeNode} from '@/core/utils/tree'

export type FlatTreeRow = {node: TreeNode; depth: number}

export type DataSourceTreeKeyAction =
    | {type: 'activate'; index: number; node: TreeNode}
    | {type: 'open'; node: TreeNode}
    | {type: 'toggleExpand'; nodeId: string}
    | {type: 'toggleCheck'; node: TreeNode}

export function dataSourceTreeItemDomId(nodeId: string): string {
    return `dw-tree-item-${nodeId}`
}

function resolveActiveIndex(
    flatNodes: readonly FlatTreeRow[],
    activeId: string | null | undefined,
): number {
    if (!flatNodes.length) return -1
    if (activeId) {
        const idx = flatNodes.findIndex((row) => row.node.id === activeId)
        if (idx >= 0) return idx
    }
    return 0
}

function isNavigableDraft(node: TreeNode): boolean {
    return (
        node.type === 'project-files-draft'
        || node.type === 'group-draft'
        || node.type === 'project-files-hint'
    )
}

/**
 * Resolve Arrow/Home/End/Enter/Space for a flat virtualized tree (FE-P2-5).
 * Pure: no DOM. Caller applies emit/scroll and ignores when inline-editing.
 */
export function resolveDataSourceTreeKeyAction(
    key: string,
    flatNodes: readonly FlatTreeRow[],
    activeId: string | null | undefined,
    options: {
        selectable: boolean
        isExpanded: (node: TreeNode) => boolean
        canExpand?: (node: TreeNode) => boolean
        isCheckable?: (node: TreeNode) => boolean
    },
): DataSourceTreeKeyAction | null {
    if (!flatNodes.length) return null
    const canExpand = options.canExpand ?? canExpandTreeNode
    const index = resolveActiveIndex(flatNodes, activeId)
    const row = flatNodes[index]
    if (!row) return null

    switch (key) {
        case 'ArrowDown': {
            const next = Math.min(flatNodes.length - 1, index + 1)
            if (next === index) return null
            return {type: 'activate', index: next, node: flatNodes[next]!.node}
        }
        case 'ArrowUp': {
            const next = Math.max(0, index - 1)
            if (next === index) return null
            return {type: 'activate', index: next, node: flatNodes[next]!.node}
        }
        case 'Home':
            return {type: 'activate', index: 0, node: flatNodes[0]!.node}
        case 'End': {
            const last = flatNodes.length - 1
            return {type: 'activate', index: last, node: flatNodes[last]!.node}
        }
        case 'ArrowRight': {
            if (canExpand(row.node) && !options.isExpanded(row.node)) {
                return {type: 'toggleExpand', nodeId: row.node.id}
            }
            const next = Math.min(flatNodes.length - 1, index + 1)
            if (next === index) return null
            return {type: 'activate', index: next, node: flatNodes[next]!.node}
        }
        case 'ArrowLeft': {
            if (canExpand(row.node) && options.isExpanded(row.node)) {
                return {type: 'toggleExpand', nodeId: row.node.id}
            }
            if (row.depth <= 0) return null
            for (let i = index - 1; i >= 0; i -= 1) {
                if (flatNodes[i]!.depth < row.depth) {
                    return {type: 'activate', index: i, node: flatNodes[i]!.node}
                }
            }
            return null
        }
        case 'Enter': {
            if (options.selectable) {
                if (options.isCheckable?.(row.node)) {
                    return {type: 'toggleCheck', node: row.node}
                }
                return null
            }
            if (row.node.type === 'load_more') {
                return {type: 'toggleExpand', nodeId: row.node.id}
            }
            if (isNavigableDraft(row.node)) return null
            return {type: 'open', node: row.node}
        }
        case ' ':
        case 'Spacebar': {
            if (options.selectable) {
                if (options.isCheckable?.(row.node)) {
                    return {type: 'toggleCheck', node: row.node}
                }
                return null
            }
            if (row.node.type === 'load_more') {
                return {type: 'toggleExpand', nodeId: row.node.id}
            }
            if (canExpand(row.node)) {
                return {type: 'toggleExpand', nodeId: row.node.id}
            }
            return {type: 'activate', index, node: row.node}
        }
        default:
            return null
    }
}
