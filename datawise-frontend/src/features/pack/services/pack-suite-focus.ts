import {SUITE_CATALOG} from '@/features/pack/catalog/pack-catalog'
import type {EntitlementMode, PackId, SuiteDefinition, SuiteId} from '@/features/pack/types/pack.types'

export type SuiteProgress = {
    suiteId: SuiteId
    total: number
    unlocked: number
    locked: readonly PackId[]
    complete: boolean
}

export function findSuiteDefinition(suiteId: string): SuiteDefinition | undefined {
    return SUITE_CATALOG.find((suite) => suite.id === suiteId)
}

/**
 * Suite cards should reflect commercial unlock progress.
 * Open mode only previews that experience — treat packs as locked so we don't claim "全部开通".
 */
export function suitePackUsableChecker(
    mode: EntitlementMode,
    isPackUsable: (packId: PackId) => boolean,
): (packId: PackId) => boolean {
    if (mode === 'open') return () => false
    return isPackUsable
}

export function suiteProgress(
    suite: SuiteDefinition,
    isPackUsable: (packId: PackId) => boolean,
): SuiteProgress {
    const locked = suite.packIds.filter((id) => !isPackUsable(id))
    const total = suite.packIds.length
    const unlocked = total - locked.length
    return {
        suiteId: suite.id,
        total,
        unlocked,
        locked,
        complete: locked.length === 0 && total > 0,
    }
}

export type SuitePaywallTarget =
    | {kind: 'complete'; suiteId: SuiteId}
    | {kind: 'paywall'; suiteId: SuiteId; packId: PackId; context: SuiteId}

/** Pick first locked pack for suite paywall; context is the suite id for copy. */
export function resolveSuitePaywallTarget(
    suiteId: string,
    isPackUsable: (packId: PackId) => boolean,
): SuitePaywallTarget | null {
    const suite = findSuiteDefinition(suiteId)
    if (!suite?.packIds.length) return null
    const progress = suiteProgress(suite, isPackUsable)
    if (progress.complete) {
        return {kind: 'complete', suiteId: suite.id}
    }
    const packId = progress.locked[0] ?? suite.packIds[0]
    return {kind: 'paywall', suiteId: suite.id, packId, context: suite.id}
}

export function isSuitePaywallContext(context: string | null | undefined): context is SuiteId {
    return context === 'suite.pro' || context === 'suite.enterprise' || context === 'suite.platform'
}
