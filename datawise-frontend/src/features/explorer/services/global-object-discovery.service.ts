import type {DiscoveryHit} from '@/features/platform/types/platform.types'
import type {GlobalObjectSearchEntry} from '@/features/explorer/services/global-object-search.service'

/** Map discovery API hits into palette object entries. */
export function discoveryHitsToSearchEntries(hits: readonly DiscoveryHit[]): GlobalObjectSearchEntry[] {
    return hits.map((hit) => {
        const searchText = [
            hit.name,
            hit.qualifiedLabel,
            hit.connectionLabel,
            hit.database,
            hit.kind,
            hit.owner,
            hit.subtitle,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

        return {
            nodeId: hit.id,
            kind: hit.kind,
            name: hit.name,
            qualifiedLabel: hit.qualifiedLabel,
            connectionId: hit.connectionId ?? '',
            connectionLabel: hit.connectionLabel ?? '',
            database: hit.database ?? '',
            owner: hit.owner ?? undefined,
            subtitle: hit.subtitle ?? undefined,
            source: 'discovery' as const,
            searchText,
        }
    })
}

/** Prefer explorer-indexed objects when the same table/view is already loaded. */
export function mergeDiscoveryEntries(
    local: readonly GlobalObjectSearchEntry[],
    discovery: readonly GlobalObjectSearchEntry[],
): GlobalObjectSearchEntry[] {
    const localKeys = new Set(
        local
            .filter((entry) => entry.kind === 'table' || entry.kind === 'view')
            .map((entry) => `${entry.kind}|${entry.connectionId}|${entry.database}|${entry.name}`.toLowerCase()),
    )
    const extras = discovery.filter((entry) => {
        if (entry.kind === 'metric') return true
        if (entry.kind !== 'table' && entry.kind !== 'view') return true
        const key = `${entry.kind}|${entry.connectionId}|${entry.database}|${entry.name}`.toLowerCase()
        return !localKeys.has(key)
    })
    return [...local, ...extras]
}
