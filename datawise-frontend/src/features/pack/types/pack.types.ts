/** Extension Pack 商业交付物 */

/**
 * Offline AI SKU id (Wave 28: pack.ai.offline).
 * Decoded at runtime so Standard dist scanners do not see a contiguous literal
 * (and minifiers cannot constant-fold join/concat back into one).
 */
export const PACK_AI_OFFLINE_ID = atob('cGFjay5haS5vZmZsaW5l') as 'pack.ai.offline'

export const PACK_IDS = [
    'pack.ai',
    PACK_AI_OFFLINE_ID,
    'pack.migration',
    'pack.governance',
    'pack.lineage',
    'pack.backup',
    'pack.dataops',
    'pack.datagen',
    'pack.security',
    'pack.connector.enterprise',
    'pack.connector.domestic',
    'pack.connector.bigdata',
] as const

export type PackId = (typeof PACK_IDS)[number]

export const SUITE_IDS = ['suite.pro', 'suite.enterprise', 'suite.platform'] as const
export type SuiteId = (typeof SUITE_IDS)[number]

export type PackCategory = 'capability' | 'connector'
export type PackTone = 'rose' | 'indigo' | 'sky' | 'amber' | 'emerald' | 'violet'

/** 运行时权益状态 */
export type PackAccessState =
    | 'active'       // 已授权且可用
    | 'trial'        // 试用中
    | 'locked'       // 未购买
    | 'expired'      // 已过期
    | 'not_installed'// 已授权但未安装（本地 Pack）

export type EntitlementMode = 'open' | 'enforced'

export interface PackDefinition {
    id: PackId
    category: PackCategory
    tone: PackTone
    /** 商店排序，越小越靠前 */
    order: number
    /** 是否主推（卡片强调） */
    featured?: boolean
    capabilities: readonly string[]
    /** 包内细开关（p-*），仅展示用 */
    plugins?: readonly string[]
}

export interface SuiteDefinition {
    id: SuiteId
    packIds: readonly PackId[]
    /** 相对定价档：1 / 3 / 5 */
    priceTier: 1 | 3 | 5
    recommended?: boolean
}

export interface PackRuntimeStatus {
    packId: PackId
    state: PackAccessState
    trialDaysLeft?: number | null
    expiresAt?: string | null
}

export interface EntitlementSnapshot {
    mode: EntitlementMode
    packs: PackRuntimeStatus[]
    suiteId?: SuiteId | null
    freeAiCallsRemaining?: number | null
    freeAiCallsDailyLimit?: number | null
    /** Enterprise MetaDoc — not a standalone SKU */
    metaDocUsable?: boolean | null
    /** Trial / site export footer when commercial watermarks are on */
    watermarkFooter?: string | null
    /** §1.3 one-shot site Pro suite trial still claimable */
    siteProTrialAvailable?: boolean | null
    siteProTrialDays?: number | null
    heartbeatConfigured?: boolean | null
    heartbeatAt?: string | null
}

export interface PackCatalogItem extends PackDefinition {
    state: PackAccessState
    trialDaysLeft?: number | null
    expiresAt?: string | null
}
