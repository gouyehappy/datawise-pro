import {isStandardEdition} from '@/features/pack/services/is-standard-edition'
import {PACK_AI_OFFLINE_ID, type PackId} from '@/features/pack/types/pack.types'

/**
 * Capability packs whose runtime UI is stubbed out of the Standard frontend build.
 * License/trial may still succeed against the API; the workbench cannot host the feature.
 */
const STANDARD_STUBBED_PACKS: ReadonlySet<PackId> = new Set([
    'pack.ai',
    PACK_AI_OFFLINE_ID,
    'pack.migration',
    'pack.governance',
    'pack.lineage',
    'pack.backup',
    'pack.dataops',
    'pack.datagen',
    'pack.security',
])

/** False when this build cannot actually run the pack UI (Standard stubs). */
export function isPackRuntimeDeliverable(packId: PackId): boolean {
    if (!isStandardEdition()) return true
    return !STANDARD_STUBBED_PACKS.has(packId)
}
