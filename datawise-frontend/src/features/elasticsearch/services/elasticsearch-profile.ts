/** Parse Elasticsearch `_search?profile=true` response into a timing tree. */

export type ElasticsearchProfileHeatLevel = 'none' | 'cool' | 'warm' | 'hot'

export interface ElasticsearchProfileNode {
    type: string
    description?: string
    timeInNanos: number
    breakdown?: Record<string, number>
    children: ElasticsearchProfileNode[]
    selfTimeInNanos: number
    costShare: number
    heatLevel: ElasticsearchProfileHeatLevel
    isCriticalPath: boolean
}

export interface ElasticsearchProfileShard {
    id: string
    tree: ElasticsearchProfileNode
    totalTimeInNanos: number
    searchCount?: number
}

export interface ElasticsearchProfileData {
    shards: ElasticsearchProfileShard[]
}

interface RawQueryNode {
    type?: unknown
    description?: unknown
    time_in_nanos?: unknown
    breakdown?: unknown
    children?: unknown
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null
}

function readNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
}

function heatLevel(share: number): ElasticsearchProfileHeatLevel {
    if (share >= 0.35) return 'hot'
    if (share >= 0.15) return 'warm'
    if (share > 0) return 'cool'
    return 'none'
}

function mapQueryNode(raw: RawQueryNode): ElasticsearchProfileNode {
    const childrenRaw = Array.isArray(raw.children) ? raw.children : []
    const children: ElasticsearchProfileNode[] = []
    for (const child of childrenRaw) {
        const record = readRecord(child)
        if (record) children.push(mapQueryNode(record as RawQueryNode))
    }
    const timeInNanos = Math.max(0, readNumber(raw.time_in_nanos))
    const childrenTotal = children.reduce((sum, child) => sum + child.timeInNanos, 0)
    const selfTimeInNanos = Math.max(0, timeInNanos - childrenTotal)
    let breakdown: Record<string, number> | undefined
    const breakdownRaw = readRecord(raw.breakdown)
    if (breakdownRaw) {
        const entries = Object.entries(breakdownRaw)
            .map(([name, value]) => [name, readNumber(value)] as const)
            .filter(([, value]) => value > 0)
        if (entries.length > 0) breakdown = Object.fromEntries(entries)
    }
    return {
        type: typeof raw.type === 'string' && raw.type ? raw.type : 'Query',
        description: typeof raw.description === 'string' && raw.description ? raw.description : undefined,
        timeInNanos,
        breakdown,
        children,
        selfTimeInNanos,
        costShare: 0,
        heatLevel: 'none',
        isCriticalPath: false,
    }
}

function applyCostShares(node: ElasticsearchProfileNode, denominator: number): void {
    node.costShare = denominator > 0 ? node.selfTimeInNanos / denominator : 0
    node.heatLevel = node.selfTimeInNanos > 0 ? heatLevel(node.costShare) : 'none'
    for (const child of node.children) applyCostShares(child, denominator)
}

function markCriticalPath(node: ElasticsearchProfileNode): void {
    node.isCriticalPath = true
    if (node.children.length === 0) return
    let best = node.children[0]
    for (const child of node.children) {
        if (child.timeInNanos > best.timeInNanos) best = child
    }
    markCriticalPath(best)
}

function finalizeTree(node: ElasticsearchProfileNode): void {
    if (node.timeInNanos > 0) applyCostShares(node, node.timeInNanos)
    markCriticalPath(node)
}

function buildShard(searches: unknown): {tree: ElasticsearchProfileNode; total: number; searchCount: number} | null {
    const searchList = Array.isArray(searches) ? searches : []
    const queryRoots: ElasticsearchProfileNode[] = []
    for (const search of searchList) {
        const record = readRecord(search)
        if (!record) continue
        const queryArray = Array.isArray(record.query) ? record.query : []
        for (const query of queryArray) {
            const queryRecord = readRecord(query)
            if (queryRecord) queryRoots.push(mapQueryNode(queryRecord as RawQueryNode))
        }
    }
    if (queryRoots.length === 0) return null
    const total = queryRoots.reduce((sum, root) => sum + root.timeInNanos, 0)
    const tree = queryRoots.length === 1
        ? queryRoots[0]
        : {
            type: 'search',
            timeInNanos: total,
            children: queryRoots,
            selfTimeInNanos: 0,
            costShare: 0,
            heatLevel: 'none' as const,
            isCriticalPath: false,
        }
    finalizeTree(tree)
    return {tree, total, searchCount: queryRoots.length}
}

export function parseElasticsearchProfile(body: string): ElasticsearchProfileData | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(body)
    } catch {
        return null
    }
    const root = readRecord(parsed)
    if (!root) return null
    const profile = readRecord(root.profile)
    if (!profile) return null
    const shardsRaw = profile.shards
    if (!Array.isArray(shardsRaw) || shardsRaw.length === 0) return null
    const shards: ElasticsearchProfileShard[] = []
    for (const shardRaw of shardsRaw) {
        const record = readRecord(shardRaw)
        if (!record) continue
        const id = typeof record.id === 'string' && record.id ? record.id : String(shards.length + 1)
        const built = buildShard(record.searches)
        if (!built) continue
        shards.push({id, tree: built.tree, totalTimeInNanos: built.total, searchCount: built.searchCount})
    }
    if (shards.length === 0) return null
    shards.sort((a, b) => b.totalTimeInNanos - a.totalTimeInNanos)
    return {shards}
}

export function countProfileNodes(node: ElasticsearchProfileNode): number {
    let count = 1
    for (const child of node.children) count += countProfileNodes(child)
    return count
}

function trimZero(value: string): string {
    return value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
}

export function formatProfileNanos(nanos: number): string {
    const value = Math.max(0, nanos)
    if (value >= 1e9) return `${trimZero((value / 1e9).toFixed(2))}s`
    if (value >= 1e6) return `${trimZero((value / 1e6).toFixed(2))}ms`
    if (value >= 1e3) return `${trimZero((value / 1e3).toFixed(1))}µs`
    return `${Math.round(value)}ns`
}

export function formatCostShare(share: number): string {
    return `${Math.round(Math.max(0, share) * 100)}%`
}
