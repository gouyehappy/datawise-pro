import type {ConnectorMarketEntry} from '@/features/datasource/types/datasource.types'

export type ConnectorMarketSortMode = 'featured' | 'name' | 'status' | 'custom'
export type ConnectorMarketViewMode = 'grid' | 'list'
export type ConnectorCardSize = 'hero' | 'wide' | 'tall' | 'standard' | 'compact' | 'list'

const SORT_STORAGE_KEY = 'datawise-connector-market-sort'
const ORDER_STORAGE_KEY = 'datawise-connector-market-order'
const VIEW_STORAGE_KEY = 'datawise-connector-market-view'

const SORT_MODES: readonly ConnectorMarketSortMode[] = ['featured', 'name', 'status', 'custom']
const VIEW_MODES: readonly ConnectorMarketViewMode[] = ['grid', 'list']

export function isConnectorMarketSortMode(value: unknown): value is ConnectorMarketSortMode {
    return typeof value === 'string' && (SORT_MODES as readonly string[]).includes(value)
}

export function readMarketSortMode(): ConnectorMarketSortMode {
    try {
        const raw = localStorage.getItem(SORT_STORAGE_KEY)
        if (isConnectorMarketSortMode(raw)) return raw
    } catch {
        /* ignore */
    }
    return 'featured'
}

export function writeMarketSortMode(mode: ConnectorMarketSortMode): void {
    try {
        localStorage.setItem(SORT_STORAGE_KEY, mode)
    } catch {
        /* ignore */
    }
}

export function isConnectorMarketViewMode(value: unknown): value is ConnectorMarketViewMode {
    return typeof value === 'string' && (VIEW_MODES as readonly string[]).includes(value)
}

export function readMarketViewMode(): ConnectorMarketViewMode {
    try {
        const raw = localStorage.getItem(VIEW_STORAGE_KEY)
        if (isConnectorMarketViewMode(raw)) return raw
    } catch {
        /* ignore */
    }
    return 'grid'
}

export function writeMarketViewMode(mode: ConnectorMarketViewMode): void {
    try {
        localStorage.setItem(VIEW_STORAGE_KEY, mode)
    } catch {
        /* ignore */
    }
}

export function readMarketCustomOrder(): string[] {
    try {
        const raw = localStorage.getItem(ORDER_STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    } catch {
        return []
    }
}

export function writeMarketCustomOrder(ids: string[]): void {
    try {
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(ids))
    } catch {
        /* ignore */
    }
}

function compareLabel(a: ConnectorMarketEntry, b: ConnectorMarketEntry): number {
    return a.label.localeCompare(b.label, undefined, {sensitivity: 'base'})
}

/** Seed order: primary first, then label — used before any custom drag. */
export function defaultConnectorMarketOrder(entries: ConnectorMarketEntry[]): string[] {
    return [...entries]
        .sort((a, b) => {
            if (a.primary !== b.primary) return a.primary ? -1 : 1
            return compareLabel(a, b)
        })
        .map((entry) => entry.id)
}

export function mergeConnectorMarketOrder(
    preferred: string[],
    entries: ConnectorMarketEntry[],
): string[] {
    const known = new Set(entries.map((entry) => entry.id))
    const merged: string[] = []
    for (const id of preferred) {
        if (known.has(id) && !merged.includes(id)) merged.push(id)
    }
    for (const id of defaultConnectorMarketOrder(entries)) {
        if (!merged.includes(id)) merged.push(id)
    }
    return merged
}

export function moveConnectorInOrder(order: string[], fromId: string, toId: string): string[] {
    if (fromId === toId) return order
    const next = order.filter((id) => id !== fromId)
    const toIndex = next.indexOf(toId)
    if (toIndex < 0) {
        next.push(fromId)
        return next
    }
    next.splice(toIndex, 0, fromId)
    return next
}

export function sortConnectorMarketEntries(
    entries: ConnectorMarketEntry[],
    mode: ConnectorMarketSortMode,
    customOrder: string[] = [],
): ConnectorMarketEntry[] {
    if (!entries.length) return []
    if (mode === 'name') {
        return [...entries].sort(compareLabel)
    }
    if (mode === 'status') {
        return [...entries].sort((a, b) => {
            if (a.available !== b.available) return a.available ? -1 : 1
            return compareLabel(a, b)
        })
    }
    if (mode === 'custom') {
        const order = mergeConnectorMarketOrder(customOrder, entries)
        const rank = new Map(order.map((id, index) => [id, index]))
        return [...entries].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    }
    // featured
    return [...entries].sort((a, b) => {
        if (a.primary !== b.primary) return a.primary ? -1 : 1
        if (a.available !== b.available) return a.available ? -1 : 1
        return compareLabel(a, b)
    })
}

/**
 * Varied tile sizes for dense CSS grid. Independent of filter — based on entry + position.
 */
export function resolveConnectorCardSize(
    entry: ConnectorMarketEntry,
    index: number,
    options?: {standalone?: boolean; viewMode?: ConnectorMarketViewMode},
): ConnectorCardSize {
    if (options?.viewMode === 'list') {
        return 'list'
    }
    if (!options?.standalone) {
        return entry.primary ? 'wide' : 'standard'
    }
    if (index === 0 && (entry.primary || entry.available)) {
        return 'hero'
    }
    if (entry.primary && entry.available) {
        return index < 4 ? 'wide' : 'standard'
    }
    if (!entry.available && (entry.installHint || entry.downloadUrl)) {
        return 'tall'
    }
    if (!entry.primary && entry.available && index % 5 === 0) {
        return 'wide'
    }
    if (!entry.primary && !entry.available) {
        return 'compact'
    }
    return 'standard'
}

export function connectorCardCapLimit(size: ConnectorCardSize): number {
    if (size === 'hero') return 8
    if (size === 'wide' || size === 'tall') return 6
    if (size === 'compact' || size === 'list') return 2
    return 4
}
