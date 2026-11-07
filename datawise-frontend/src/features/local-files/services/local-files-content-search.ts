import type {LocalFileTreeNode} from '@/features/local-files/stores/local-files-store'
import {isLocalBinaryFileName} from '@/features/local-files/services/local-files-path'
import {
    matchesLocalFilesExtFilter,
    type LocalFilesExtFilter,
} from '@/features/local-files/services/local-files-search'

export type ScanLocalFileContentHitsOptions = {
    tree: LocalFileTreeNode[]
    query: string
    extFilter?: LocalFilesExtFilter
    readText: (path: string) => Promise<string>
    maxFiles?: number
    concurrency?: number
    isCancelled?: () => boolean
}

function collectCandidateFiles(
    nodes: LocalFileTreeNode[],
    extFilter: LocalFilesExtFilter,
    out: LocalFileTreeNode[],
    maxFiles: number,
) {
    for (const node of nodes) {
        if (out.length >= maxFiles) return
        if (node.isDirectory) {
            if (node.children?.length) collectCandidateFiles(node.children, extFilter, out, maxFiles)
            continue
        }
        if (isLocalBinaryFileName(node.name)) continue
        if (!matchesLocalFilesExtFilter(node, extFilter)) continue
        out.push(node)
    }
}

/**
 * Scan loaded tree files for a case-insensitive substring in content.
 * Caps how many files are opened so large workspaces stay responsive.
 */
export async function scanLocalFileContentHits(
    options: ScanLocalFileContentHitsOptions,
): Promise<Set<string>> {
    const q = options.query.trim().toLowerCase()
    const hits = new Set<string>()
    if (q.length < 2) return hits

    const maxFiles = options.maxFiles ?? 300
    const concurrency = Math.max(1, options.concurrency ?? 6)
    const extFilter = options.extFilter ?? 'all'
    const files: LocalFileTreeNode[] = []
    collectCandidateFiles(options.tree, extFilter, files, maxFiles)

    let next = 0
    async function worker() {
        while (next < files.length) {
            if (options.isCancelled?.()) return
            const index = next
            next += 1
            const file = files[index]
            try {
                const text = await options.readText(file.path)
                if (options.isCancelled?.()) return
                if (text.toLowerCase().includes(q)) hits.add(file.id)
            } catch {
                /* unreadable — skip */
            }
        }
    }

    const workers = Array.from({length: Math.min(concurrency, files.length)}, () => worker())
    await Promise.all(workers)
    return hits
}
