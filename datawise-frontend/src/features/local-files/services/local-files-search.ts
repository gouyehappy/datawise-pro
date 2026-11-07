import type {LocalFileTreeNode} from '@/features/local-files/stores/local-files-store'
import {fileExtension, isLocalSqlFileName} from '@/features/local-files/services/local-files-path'

export type LocalFilesExtFilter = 'all' | 'sql' | 'markdown' | 'config'

export type LocalFilesSearchVisibility = {
    visibleIds: Set<string>
    forceExpandIds: Set<string>
}

const MARKDOWN_EXTS = new Set(['.md', '.markdown'])
const CONFIG_EXTS = new Set([
    '.json',
    '.yaml',
    '.yml',
    '.xml',
    '.properties',
    '.conf',
    '.ini',
    '.toml',
    '.env',
])

export function matchesLocalFilesExtFilter(
    node: LocalFileTreeNode,
    filter: LocalFilesExtFilter,
): boolean {
    if (filter === 'all') return true
    if (node.isDirectory) return false
    if (filter === 'sql') return isLocalSqlFileName(node.name)
    const ext = fileExtension(node.name)
    if (filter === 'markdown') return MARKDOWN_EXTS.has(ext)
    if (filter === 'config') return CONFIG_EXTS.has(ext)
    return true
}

/**
 * Filter local-file tree by name query and/or extension.
 * Keeps matching nodes and their ancestors; directories stay if a descendant matches.
 * Optional contentHitIds also marks files whose body matched a content scan.
 * Call after deep-loading folders when searching so unloaded children are included.
 */
export function collectLocalFilesSearchVisibility(
    nodes: LocalFileTreeNode[],
    query: string,
    extFilter: LocalFilesExtFilter = 'all',
    contentHitIds?: Set<string> | null,
): LocalFilesSearchVisibility | null {
    const q = query.trim().toLowerCase()
    const hasQuery = q.length > 0
    const hasExt = extFilter !== 'all'
    if (!hasQuery && !hasExt) return null

    const visibleIds = new Set<string>()
    const forceExpandIds = new Set<string>()
    const ancestors: LocalFileTreeNode[] = []

    function walk(node: LocalFileTreeNode): boolean {
        ancestors.push(node)
        let childMatch = false
        for (const child of node.children ?? []) {
            if (walk(child)) childMatch = true
        }
        ancestors.pop()

        const nameOk = !hasQuery || node.name.toLowerCase().includes(q)
        const extOk = !hasExt || node.isDirectory || matchesLocalFilesExtFilter(node, extFilter)
        const contentOk = Boolean(!node.isDirectory && contentHitIds?.has(node.id))
        const fileMatch = !node.isDirectory && extOk && (nameOk || contentOk)
        const dirNameMatch = node.isDirectory && hasQuery && nameOk
        const hit = fileMatch || dirNameMatch || childMatch
        if (hit) {
            visibleIds.add(node.id)
            for (const ancestor of ancestors) {
                visibleIds.add(ancestor.id)
                forceExpandIds.add(ancestor.id)
            }
        }
        return hit
    }

    for (const node of nodes) {
        walk(node)
    }
    return {visibleIds, forceExpandIds}
}
