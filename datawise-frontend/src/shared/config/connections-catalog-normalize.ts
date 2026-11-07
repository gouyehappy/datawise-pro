import {
    createEmptyConnectionsCatalog,
    type ConnectionEntryRecord,
    type ConnectionGroupRecord,
    type ConnectionsCatalog,
} from '@/shared/config/connections-catalog.types'

export function dedupeCatalogGroups(groups: ConnectionGroupRecord[]): ConnectionGroupRecord[] {
    const byId = new Map<string, ConnectionGroupRecord>()
    for (const group of groups) {
        const id = group.id?.trim()
        if (!id) continue
        byId.set(id, group)
    }
    return [...byId.values()]
}

export function dedupeCatalogConnections(connections: ConnectionEntryRecord[]): ConnectionEntryRecord[] {
    const byId = new Map<string, ConnectionEntryRecord>()
    for (const entry of connections) {
        const id = entry.id?.trim()
        if (!id) continue
        byId.set(id, entry)
    }
    return [...byId.values()]
}

export function normalizeConnectionsCatalog(raw: ConnectionsCatalog | null | undefined): ConnectionsCatalog {
    if (!raw) return createEmptyConnectionsCatalog()
    return {
        version: 1,
        groups: dedupeCatalogGroups(Array.isArray(raw.groups) ? raw.groups : []),
        connections: dedupeCatalogConnections(Array.isArray(raw.connections) ? raw.connections : []),
    }
}
