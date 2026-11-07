import type {ConnectorMarketEntry} from '@/features/datasource/types/datasource.types'
import {categoryForConnectorId} from '@/features/datasource/services/connector-market-category.service'

type Translate = (key: string, values?: Record<string, unknown>) => string
type TranslateExists = (key: string) => boolean

/** Prefer connector-specific blurb, then category blurb, then generic fallback. */
export function resolveConnectorMarketIntro(
    entry: ConnectorMarketEntry,
    t: Translate,
    te: TranslateExists,
): string {
    const specific = `plugin.connectorMarket.intros.${entry.id}`
    if (te(specific)) return t(specific)
    const category = categoryForConnectorId(entry.id)
    const categoryKey = `plugin.connectorMarket.introCategories.${category}`
    if (te(categoryKey)) return t(categoryKey)
    return t('plugin.connectorMarket.intros.default', {name: entry.label})
}

export function resolveConnectorMarketHighlights(
    entry: ConnectorMarketEntry,
    t: Translate,
    te: TranslateExists,
): string[] {
    const key = `plugin.connectorMarket.highlights.${entry.id}`
    if (!te(key)) return []
    const raw = t(key)
    return raw
        .split(/\n|;|；/)
        .map((line) => line.trim())
        .filter(Boolean)
}
