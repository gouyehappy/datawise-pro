import type {TreeNode} from '@/core/types'
import {walkTree} from '@/core/utils/tree'

/** Collect open root directories (first-level groups) for app-config persistence. */
export function collectFirstLevelExpandedNodeIds(tree: TreeNode[]): string[] {
    return (tree ?? [])
        .filter((node) => node?.expanded)
        .map((node) => node.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

/** Apply open/closed only on root nodes; deeper nodes are left unchanged.
 * Empty / missing ids means “no persisted preference” — keep expand flags from the tree payload.
 * (Default app-config is `[]`; applying that as “collapse all” hid connections under groups.)
 */
export function applyFirstLevelExpandedNodeIds(tree: TreeNode[], ids: string[] | null | undefined) {
    if (ids == null || ids.length === 0) return
    const set = new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))
    for (const node of tree ?? []) {
        node.expanded = set.has(node.id)
    }
}

/** Collect all expanded node ids (in-session tree remount; not written to app-config). */
export function collectExpandedNodeIds(tree: TreeNode[]): string[] {
    const ids: string[] = []
    walkTree(tree, (node) => {
        if (node.expanded) ids.push(node.id)
    })
    return ids
}

/** Re-apply full expand flags after tree remount (in-session only). */
export function applyExpandedNodeIds(tree: TreeNode[], ids: string[]) {
    const set = new Set(ids)
    walkTree(tree, (node) => {
        node.expanded = set.has(node.id)
    })
}
