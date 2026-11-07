/** Explorer 连接树：温热池（已连接）与可达性（ping）分离 */

export type ConnectionReachability = 'ok' | 'error'

/**
 * Stateless connectors: each API call is independent (no server-side pool/session).
 * Align with backend `catalog.kind=nonJdbc` in db-type-profiles.properties.
 * SSH interactive shells use their own WebSocket lifecycle — not an Explorer JDBC pool.
 * Community `plugin` connections keep credentials in the sidecar; idle JDBC eviction
 * must not paint the workspace reconnect overlay over their workbench.
 */
const STATELESS_CONNECTOR_DB_TYPES = new Set([
    'jenkins',
    'nacos',
    'polaris',
    'kafka',
    'redis',
    'yarn',
    'mongodb',
    'kudu',
    'ssh',
    'kubernetes',
    'plugin',
])

/** Align with backend JdbcConnectionPoolWarmupService.usesJdbcPool. */
const NON_JDBC_POOL_DB_TYPES = new Set([...STATELESS_CONNECTOR_DB_TYPES])

export function isStatelessConnector(dbType?: string | null): boolean {
    if (!dbType?.trim()) return false
    return STATELESS_CONNECTOR_DB_TYPES.has(dbType.trim().toLowerCase())
}

/** Only JDBC pools need the full-workspace reconnect overlay after idle eviction. */
export function usesConnectionReconnectOverlay(dbType?: string | null): boolean {
    return usesJdbcConnectionPool(dbType)
}

/** Background ping probes only JDBC warmed pools; stateless connectors fail on real use. */
export function usesPeriodicConnectionHealthProbe(dbType?: string | null): boolean {
    return usesJdbcConnectionPool(dbType)
}

export function usesJdbcConnectionPool(dbType?: string | null): boolean {
    if (!dbType?.trim()) return false
    return !NON_JDBC_POOL_DB_TYPES.has(dbType.trim().toLowerCase())
}

export function resolveConnectionDisplayHealth(
    connectionId: string,
    pooledIds: ReadonlySet<string>,
    reachabilityById: Record<string, ConnectionReachability>,
): ConnectionReachability | undefined {
    if (!pooledIds.has(connectionId)) return undefined
    return reachabilityById[connectionId] === 'error' ? 'error' : 'ok'
}

export function buildConnectionDisplayHealthMap(
    pooledIds: ReadonlySet<string>,
    reachabilityById: Record<string, ConnectionReachability>,
): Record<string, ConnectionReachability> {
    const next: Record<string, ConnectionReachability> = {}
    for (const connectionId of pooledIds) {
        const display = resolveConnectionDisplayHealth(connectionId, pooledIds, reachabilityById)
        if (display) next[connectionId] = display
    }
    return next
}

export function resolveConnectionLinkState(
    connectionId: string,
    pooledIds: ReadonlySet<string>,
    reachabilityById: Record<string, ConnectionReachability>,
    loadingNodeIds: ReadonlySet<string>,
): 'connected' | 'disconnected' | 'error' | 'loading' {
    if (loadingNodeIds.has(connectionId)) return 'loading'
    if (!pooledIds.has(connectionId)) {
        return reachabilityById[connectionId] === 'error' ? 'error' : 'disconnected'
    }
    return reachabilityById[connectionId] === 'error' ? 'error' : 'connected'
}

/**
 * Merge server JDBC pool membership with UI-connected non-JDBC datasources.
 * Avoids wiping Redis/Kafka/SSH green badges on the periodic pool sync.
 * Stateless connectors stay green while in use (open tab or prior connect) even without a server pool.
 */
export function mergePooledConnectionSync(input: {
    serverPooledIds: readonly string[]
    previousPooledIds: ReadonlySet<string>
    resolveDbType: (connectionId: string) => string | undefined | null
    isUiConnected: (connectionId: string) => boolean
    isConnectionInUse?: (connectionId: string) => boolean
}): {nextPooledIds: Set<string>; evictedIds: string[]} {
    const nextPooledIds = new Set(input.serverPooledIds)
    const evictedIds: string[] = []

    for (const connectionId of input.previousPooledIds) {
        if (nextPooledIds.has(connectionId)) continue
        const dbType = input.resolveDbType(connectionId)
        if (isStatelessConnector(dbType)) {
            const inUse = input.isConnectionInUse?.(connectionId) ?? false
            if (input.isUiConnected(connectionId) || inUse) {
                nextPooledIds.add(connectionId)
                continue
            }
            evictedIds.push(connectionId)
            continue
        }
        if (!usesJdbcConnectionPool(dbType) && input.isUiConnected(connectionId)) {
            nextPooledIds.add(connectionId)
            continue
        }
        evictedIds.push(connectionId)
    }

    return {nextPooledIds, evictedIds}
}
