import {normalizeLocalPathKey} from '@/features/local-files/services/local-files-path'
import type {
    LocalFilesInlineEdit,
    LocalFileTreeNode,
} from '@/features/local-files/stores/local-files-store'
import type {FlatTreeEntry} from '@/features/explorer/composables/useTreeVirtualWindow'

/** One virtualized row: real node, inline create draft, or empty-folder hint. */
export type LocalFileRowModel =
    | {kind: 'node'; id: string; file: LocalFileTreeNode}
    | {kind: 'draft'; id: string; parent: LocalFileTreeNode}
    | {kind: 'empty'; id: string; parent: LocalFileTreeNode}

export type LocalFileFlatEntry = FlatTreeEntry<LocalFileRowModel>

function isCreateParent(node: LocalFileTreeNode, inlineEdit: LocalFilesInlineEdit | null): boolean {
    if (!inlineEdit || (inlineEdit.mode !== 'create-file' && inlineEdit.mode !== 'create-folder')) {
        return false
    }
    return normalizeLocalPathKey(inlineEdit.parentPath) === normalizeLocalPathKey(node.path)
}

/**
 * Depth-first flatten of the visible local-files tree (respects expand + search filter).
 * Includes create-draft / empty-folder synthetic rows so virtualization stays 1:1 with UI.
 */
export function flattenLocalFileTree(
    tree: LocalFileTreeNode[],
    expandedIds: Set<string>,
    visibleIds: Set<string> | null,
    inlineEdit: LocalFilesInlineEdit | null,
): LocalFileFlatEntry[] {
    const out: LocalFileFlatEntry[] = []

    const walk = (nodes: LocalFileTreeNode[], depth: number) => {
        for (const node of nodes) {
            if (visibleIds && !visibleIds.has(node.id)) continue
            out.push({depth, node: {kind: 'node', id: node.id, file: node}})

            if (!node.isDirectory || !expandedIds.has(node.id)) continue

            if (isCreateParent(node, inlineEdit) && inlineEdit) {
                out.push({
                    depth: inlineEdit.depth,
                    node: {kind: 'draft', id: `draft:${node.id}`, parent: node},
                })
            } else if (node.loaded && !(node.children?.length)) {
                out.push({
                    depth: depth + 1,
                    node: {kind: 'empty', id: `empty:${node.id}`, parent: node},
                })
            }

            if (node.children?.length) {
                walk(node.children, depth + 1)
            }
        }
    }

    walk(tree, 0)
    return out
}

/** Flat index of a real file/folder row (skips draft/empty synthetics). */
export function findLocalFileFlatNodeIndex(
    flat: readonly LocalFileFlatEntry[],
    nodeId: string | null | undefined,
): number {
    if (!nodeId) return -1
    for (let i = 0; i < flat.length; i += 1) {
        const row = flat[i].node
        if (row.kind === 'node' && row.id === nodeId) return i
    }
    return -1
}
