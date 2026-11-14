import {PACK_AI_OFFLINE_ID, type PackId, type SuiteId} from '@/features/pack/types/pack.types'

/**
 * B3-1: human capability layers over commercial pack ids.
 * Pack / suite SKUs stay internal; UI talks Core / Team / Insight / Extend.
 */
export type CapabilityLayer = 'core' | 'team' | 'insight' | 'extend'

/** Store filter chips (Core has no commercial packs — shown as empty-state blurb). */
export const PACK_STORE_LAYER_FILTERS: readonly CapabilityLayer[] = [
    'core',
    'team',
    'insight',
    'extend',
] as const

const PACK_LAYER_MAP: Record<PackId, CapabilityLayer> = {
    'pack.ai': 'insight',
    [PACK_AI_OFFLINE_ID]: 'insight',
    'pack.governance': 'team',
    'pack.security': 'team',
    'pack.migration': 'extend',
    'pack.lineage': 'extend',
    'pack.backup': 'extend',
    'pack.dataops': 'extend',
    'pack.datagen': 'extend',
    'pack.connector.enterprise': 'extend',
    'pack.connector.domestic': 'extend',
    'pack.connector.bigdata': 'extend',
}

/** Suite primary framing for paywall eyebrow (bundles still list packs). */
const SUITE_LAYER_MAP: Record<SuiteId, CapabilityLayer> = {
    'suite.pro': 'insight',
    'suite.enterprise': 'extend',
    'suite.platform': 'extend',
}

export function resolvePackLayer(packId: PackId | string | null | undefined): CapabilityLayer | null {
    if (!packId) return null
    return PACK_LAYER_MAP[packId as PackId] ?? null
}

export function resolveSuiteLayer(suiteId: SuiteId | string | null | undefined): CapabilityLayer | null {
    if (!suiteId) return null
    return SUITE_LAYER_MAP[suiteId as SuiteId] ?? null
}

export function resolvePaywallLayer(options: {
    packId?: PackId | string | null
    suiteId?: SuiteId | string | null
}): CapabilityLayer | null {
    return resolveSuiteLayer(options.suiteId) ?? resolvePackLayer(options.packId)
}
