import type {ConnectorMarketEntry} from '@/features/datasource/types/datasource.types'
import type {DbType} from '@/core/types'
import {
    DB_TYPE_CATEGORIES,
    categoryForDbType,
    type DbTypeCategoryDef,
    type DbTypeCategoryKey,
} from '@/features/connection/constants/db-type-categories'

/** Connector market ids align with DbType; unknown ids fall back to sql. */
export function categoryForConnectorId(connectorId: string): DbTypeCategoryKey {
    return categoryForDbType(connectorId as DbType)
}

export function visibleCategoriesForEntries(
    entries: readonly ConnectorMarketEntry[],
): DbTypeCategoryDef[] {
    const present = new Set(entries.map((entry) => categoryForConnectorId(entry.id)))
    return DB_TYPE_CATEGORIES.filter((cat) => present.has(cat.key)).slice().sort((a, b) => a.order - b.order)
}

export function filterEntriesByCategory(
    entries: readonly ConnectorMarketEntry[],
    category: DbTypeCategoryKey | 'all',
): ConnectorMarketEntry[] {
    if (category === 'all') return [...entries]
    return entries.filter((entry) => categoryForConnectorId(entry.id) === category)
}

export function countEntriesByCategory(
    entries: readonly ConnectorMarketEntry[],
    category: DbTypeCategoryKey | 'all',
): {total: number; available: number; pending: number} {
    const list = filterEntriesByCategory(entries, category)
    const available = list.filter((entry) => entry.available).length
    return {
        total: list.length,
        available,
        pending: list.length - available,
    }
}
