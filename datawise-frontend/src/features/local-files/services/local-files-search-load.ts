import type {LocalFileTreeNode} from '@/features/local-files/stores/local-files-store'
import {localFileNodeId} from '@/features/local-files/services/local-files-path'

export type SearchLoadOptions = {
    rootPath: string
    maxDirs?: number
    concurrency?: number
    isCancelled: () => boolean
    findNodeByPath: (path: string) => LocalFileTreeNode | null
    loadChildren: (dirPath: string) => Promise<LocalFileTreeNode[]>
    /** Apply many parent→children patches in one tree commit. */
    applyChildrenBatch: (patches: Map<string, LocalFileTreeNode[]>) => void
}

/**
 * Wave-based BFS: list many directories in parallel, then commit once per wave.
 * Skips already-loaded folders; returns whether the walk finished (vs hit maxDirs).
 */
export async function loadLocalTreeForSearch(options: SearchLoadOptions): Promise<{
    dirsLoaded: number
    complete: boolean
}> {
    const maxDirs = options.maxDirs ?? 400
    const concurrency = Math.max(1, options.concurrency ?? 8)
    let dirsLoaded = 0
    let frontier: string[] = [options.rootPath]

    while (frontier.length && dirsLoaded < maxDirs) {
        if (options.isCancelled()) {
            return {dirsLoaded, complete: false}
        }

        const needLoad: string[] = []
        const nextFrontier: string[] = []

        for (const dir of frontier) {
            const node = options.findNodeByPath(dir)
            if (!node?.isDirectory) continue
            if (node.loaded) {
                for (const child of node.children ?? []) {
                    if (child.isDirectory) nextFrontier.push(child.path)
                }
                continue
            }
            needLoad.push(dir)
        }

        if (!needLoad.length) {
            frontier = nextFrontier
            continue
        }

        const budget = maxDirs - dirsLoaded
        const batch = needLoad.slice(0, budget)
        const patches = await loadDirsParallel(batch, concurrency, options)
        if (options.isCancelled()) return {dirsLoaded, complete: false}

        if (patches.size) {
            options.applyChildrenBatch(patches)
            dirsLoaded += patches.size
            for (const children of patches.values()) {
                for (const child of children) {
                    if (child.isDirectory) nextFrontier.push(child.path)
                }
            }
        }

        // Hit the directory cap before draining this wave.
        if (needLoad.length > budget) {
            return {dirsLoaded, complete: false}
        }

        // Let the UI breathe between waves.
        await Promise.resolve()
        frontier = nextFrontier
    }

    return {dirsLoaded, complete: frontier.length === 0}
}

async function loadDirsParallel(
    dirs: string[],
    concurrency: number,
    options: Pick<SearchLoadOptions, 'isCancelled' | 'loadChildren'>,
): Promise<Map<string, LocalFileTreeNode[]>> {
    const patches = new Map<string, LocalFileTreeNode[]>()
    if (!dirs.length) return patches

    let cursor = 0
    const workers = Array.from({length: Math.min(concurrency, dirs.length)}, async () => {
        while (cursor < dirs.length) {
            if (options.isCancelled()) return
            const index = cursor
            cursor += 1
            const dir = dirs[index]
            try {
                const children = await options.loadChildren(dir)
                if (options.isCancelled()) return
                patches.set(localFileNodeId(dir), children)
            } catch {
                // Skip unreadable dirs; keep searching the rest.
            }
        }
    })
    await Promise.all(workers)
    return patches
}
