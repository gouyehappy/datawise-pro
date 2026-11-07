import {joinLocalPath, normalizeLocalPathKey} from '@/features/local-files/services/local-files-path'
import {readDatawiseHost} from '@/features/layout/services/desktop-bridge'

export type LocalGitFileStatus =
    | 'modified'
    | 'added'
    | 'deleted'
    | 'renamed'
    | 'untracked'
    | 'conflict'

export type LocalGitStatusMap = Map<string, LocalGitFileStatus>

/** Map porcelain XY codes to a single UI status (conflict wins). */
export function resolveLocalGitStatus(xy: string): LocalGitFileStatus | null {
    const code = (xy || '').padEnd(2, ' ').slice(0, 2)
    if (code === '!!') return null
    if (code === '??') return 'untracked'
    if (code.includes('U') || code === 'AA' || code === 'DD') return 'conflict'
    if (code.includes('D')) return 'deleted'
    if (code.includes('R') || code.includes('C')) return 'renamed'
    if (code.includes('A')) return 'added'
    if (code.includes('M') || code.includes('T')) return 'modified'
    if (code.trim()) return 'modified'
    return null
}

export function localGitStatusLabelKey(status: LocalGitFileStatus): string {
    switch (status) {
        case 'modified':
            return 'explorer.localFiles.gitModified'
        case 'added':
            return 'explorer.localFiles.gitAdded'
        case 'deleted':
            return 'explorer.localFiles.gitDeleted'
        case 'renamed':
            return 'explorer.localFiles.gitRenamed'
        case 'untracked':
            return 'explorer.localFiles.gitUntracked'
        case 'conflict':
            return 'explorer.localFiles.gitConflict'
    }
}

export function localGitStatusGlyph(status: LocalGitFileStatus): string {
    switch (status) {
        case 'modified':
            return 'M'
        case 'added':
            return 'A'
        case 'deleted':
            return 'D'
        case 'renamed':
            return 'R'
        case 'untracked':
            return 'U'
        case 'conflict':
            return '!'
    }
}

/** Prefer the more severe status when aggregating directory children. */
export function mergeLocalGitStatus(
    a: LocalGitFileStatus | null | undefined,
    b: LocalGitFileStatus | null | undefined,
): LocalGitFileStatus | null {
    const rank: Record<LocalGitFileStatus, number> = {
        conflict: 6,
        deleted: 5,
        modified: 4,
        renamed: 3,
        added: 2,
        untracked: 1,
    }
    if (!a) return b ?? null
    if (!b) return a
    return rank[a] >= rank[b] ? a : b
}

export function buildLocalGitStatusMap(
    rootPath: string,
    entries: Array<{path: string; xy: string}>,
): LocalGitStatusMap {
    const map: LocalGitStatusMap = new Map()
    for (const entry of entries) {
        const status = resolveLocalGitStatus(entry.xy)
        if (!status) continue
        const rel = entry.path.replace(/^[/\\]+/, '').replace(/\\/g, '/')
        if (!rel) continue
        const absNested = joinNestedLocalPath(rootPath, rel)
        const key = normalizeLocalPathKey(absNested)
        const prev = map.get(key)
        map.set(key, mergeLocalGitStatus(prev, status) ?? status)
    }
    return map
}

function joinNestedLocalPath(root: string, relativePosix: string): string {
    const parts = relativePosix.split('/').filter(Boolean)
    let cursor = root
    for (const part of parts) {
        cursor = joinLocalPath(cursor, part)
    }
    return cursor
}

/** File status, or aggregated status for a directory prefix. */
export function lookupLocalGitStatus(
    map: LocalGitStatusMap | null | undefined,
    absPath: string,
    isDirectory: boolean,
): LocalGitFileStatus | null {
    if (!map?.size) return null
    const key = normalizeLocalPathKey(absPath)
    const direct = map.get(key)
    if (!isDirectory) return direct ?? null
    if (direct) return direct
    const prefix = `${key}/`
    let agg: LocalGitFileStatus | null = null
    for (const [pathKey, status] of map) {
        if (pathKey.startsWith(prefix)) {
            agg = mergeLocalGitStatus(agg, status)
        }
    }
    return agg
}

export async function fetchLocalGitStatus(rootPath: string): Promise<{
    insideRepo: boolean
    map: LocalGitStatusMap
}> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.gitStatus) {
        return {insideRepo: false, map: new Map()}
    }
    const result = await fs.gitStatus(rootPath)
    if (!result?.ok) {
        return {insideRepo: false, map: new Map()}
    }
    if (!result.insideRepo) {
        return {insideRepo: false, map: new Map()}
    }
    // Porcelain paths are relative to the git repo root, not the opened workspace folder.
    const repoRoot = (result.repoRoot || '').trim() || rootPath
    return {
        insideRepo: true,
        map: buildLocalGitStatusMap(repoRoot, result.entries ?? []),
    }
}
