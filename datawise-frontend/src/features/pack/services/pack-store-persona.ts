import {SUITE_CATALOG} from '@/features/pack/catalog/pack-catalog'
import type {SuiteDefinition, SuiteId} from '@/features/pack/types/pack.types'

/** Store visitor persona for suite recommendation (§1.2 / Wave 36). */
export type PackStorePersona = 'general' | 'dba' | 'analyst'

export const PACK_STORE_PERSONAS: readonly PackStorePersona[] = ['general', 'dba', 'analyst']

/** DBA → Enterprise (DataOps + Migration); Analyst → Pro (AI + Governance). */
export function recommendedSuiteIdForPersona(persona: PackStorePersona): SuiteId {
    switch (persona) {
        case 'dba':
            return 'suite.enterprise'
        case 'analyst':
            return 'suite.pro'
        default:
            return 'suite.pro'
    }
}

/** Suites ordered with the persona recommendation first. */
export function orderSuitesForPersona(persona: PackStorePersona): SuiteDefinition[] {
    const preferred = recommendedSuiteIdForPersona(persona)
    return [...SUITE_CATALOG].sort((a, b) => {
        if (a.id === preferred && b.id !== preferred) return -1
        if (b.id === preferred && a.id !== preferred) return 1
        return 0
    })
}

export function isSuiteRecommendedForPersona(suiteId: SuiteId, persona: PackStorePersona): boolean {
    return suiteId === recommendedSuiteIdForPersona(persona)
}
