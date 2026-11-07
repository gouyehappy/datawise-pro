import type {LockWaitEdge} from '@/shared/api/types'

export type {LockWaitEdge, LockWaitList, LockWaitQuery} from '@/shared/api/types'

export interface LockWaitChainNode {
    sessionId: string
    role: 'blocker' | 'waiting'
    waitSeconds?: number
    sql: string
    user?: string
    children: LockWaitChainNode[]
}

export function formatLockWaitDuration(seconds: number): string {
    if (seconds >= 3600) {
        const hours = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        return `${hours}h ${mins}m`
    }
    if (seconds >= 60) {
        return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    }
    return `${seconds}s`
}

export function truncateLockWaitSql(sql: string, max = 160): string {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    if (!normalized) return ''
    if (normalized.length <= max) return normalized
    return `${normalized.slice(0, max)}…`
}

export function buildBlockingChains(edges: LockWaitEdge[]): LockWaitChainNode[] {
    if (!edges.length) return []

    const waitingIds = new Set(edges.map((edge) => edge.waitingSessionId))
    const childrenMap = new Map<string, LockWaitEdge[]>()
    for (const edge of edges) {
        const list = childrenMap.get(edge.blockingSessionId) ?? []
        list.push(edge)
        childrenMap.set(edge.blockingSessionId, list)
    }

    const rootIds = [...new Set(edges.map((edge) => edge.blockingSessionId))]
        .filter((id) => !waitingIds.has(id))

    const roots = rootIds.length ? rootIds : [...new Set(edges.map((edge) => edge.blockingSessionId))]

    return roots.map((rootId) => buildRootNode(rootId, childrenMap))
}

function buildRootNode(blockerId: string, childrenMap: Map<string, LockWaitEdge[]>): LockWaitChainNode {
    const childEdges = childrenMap.get(blockerId) ?? []
    return {
        sessionId: blockerId,
        role: 'blocker',
        sql: childEdges[0]?.blockingSql ?? '',
        user: childEdges[0]?.blockingUser,
        children: childEdges.map((edge) => buildWaitingNode(edge, childrenMap)),
    }
}

function buildWaitingNode(edge: LockWaitEdge, childrenMap: Map<string, LockWaitEdge[]>): LockWaitChainNode {
    const nested = childrenMap.get(edge.waitingSessionId) ?? []
    return {
        sessionId: edge.waitingSessionId,
        role: 'waiting',
        waitSeconds: edge.waitSeconds,
        sql: edge.waitingSql,
        user: edge.waitingUser,
        children: nested.map((child) => buildWaitingNode(child, childrenMap)),
    }
}
