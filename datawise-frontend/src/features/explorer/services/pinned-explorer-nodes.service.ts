import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    canPersistLocalResource,
    canReadResource,
    resolveResourceStorageKey,
} from '@/features/auth/services/user-resource-policy'

const STORAGE_KEY = 'datawise-pinned-explorer-nodes'

function resolveStorageKey(): string {
    return resolveResourceStorageKey(UserResource.PinnedExplorerNodes, STORAGE_KEY) ?? STORAGE_KEY
}

export function readPinnedExplorerNodeIds(): string[] {
    if (!canReadResource(UserResource.PinnedExplorerNodes)) return []
    if (!canPersistLocalResource(UserResource.PinnedExplorerNodes)) return []
    try {
        const raw = localStorage.getItem(resolveStorageKey())
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
    } catch {
        return []
    }
}

export function writePinnedExplorerNodeIds(ids: string[]) {
    if (!canPersistLocalResource(UserResource.PinnedExplorerNodes)) return
    localStorage.setItem(resolveStorageKey(), JSON.stringify([...new Set(ids)]))
}

/** @returns 切换后是否已固定 */
export function togglePinnedExplorerNodeId(nodeId: string): boolean {
    const ids = new Set(readPinnedExplorerNodeIds())
    if (ids.has(nodeId)) {
        ids.delete(nodeId)
        writePinnedExplorerNodeIds([...ids])
        return false
    }
    ids.add(nodeId)
    writePinnedExplorerNodeIds([...ids])
    return true
}

export function isExplorerNodePinned(nodeId: string): boolean {
    return readPinnedExplorerNodeIds().includes(nodeId)
}
