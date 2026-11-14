import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import {packsApi} from '@/api/modules/packs'
import {
    findPackDefinition,
    PACK_CATALOG,
    resolvePackForDbType,
} from '@/features/pack/catalog/pack-catalog'
import {hasDevProductivityAccess} from '@/features/pack/services/dev-productivity-entitlement'
import {isPackRuntimeDeliverable} from '@/features/pack/services/pack-runtime-deliverable'
import type {
    EntitlementMode,
    EntitlementSnapshot,
    PackAccessState,
    PackCatalogItem,
    PackId,
    PackRuntimeStatus,
    SuiteId,
} from '@/features/pack/types/pack.types'
import {PACK_AI_OFFLINE_ID} from '@/features/pack/types/pack.types'
import type {DbType} from '@/core/types'

function openSnapshot(): EntitlementSnapshot {
    return {
        mode: 'open',
        packs: PACK_CATALOG.map((pack) => ({
            packId: pack.id,
            state: 'active',
        })),
        suiteId: null,
        freeAiCallsRemaining: null,
        freeAiCallsDailyLimit: 3,
        metaDocUsable: true,
        watermarkFooter: null,
        siteProTrialAvailable: false,
        siteProTrialDays: 7,
        heartbeatConfigured: false,
        heartbeatAt: null,
    }
}

function statusMap(packs: PackRuntimeStatus[]): Map<PackId, PackRuntimeStatus> {
    const map = new Map<PackId, PackRuntimeStatus>()
    for (const entry of packs) map.set(entry.packId, entry)
    return map
}

/** 扩展包权益：商店 / 侧栏 / 建连门禁的唯一真相源 */
export const useEntitlementStore = defineStore('entitlement', () => {
    const ready = ref(false)
    const loading = ref(false)
    const mode = ref<EntitlementMode>('open')
    const packs = ref<PackRuntimeStatus[]>([])
    const suiteId = ref<SuiteId | null>(null)
    const freeAiCallsRemaining = ref<number | null>(null)
    const freeAiCallsDailyLimit = ref<number | null>(3)
    const metaDocUsable = ref(true)
    const watermarkFooter = ref<string | null>(null)
    const siteProTrialAvailable = ref(false)
    const siteProTrialDays = ref(7)
    const heartbeatConfigured = ref(false)
    const heartbeatAt = ref<string | null>(null)
    const paywallPackId = ref<PackId | null>(null)
    const paywallContext = ref<string | null>(null)
    /** Session-scoped: one strong paywall per pack+context (§1.2 / §10). */
    const paywallShownKeys = ref(new Set<string>())
    /** Session-scoped: user dismissed this pack+context (blocks stub auto-reopen). */
    const paywallDismissedKeys = ref(new Set<string>())
    /**
     * Ignore openPaywall briefly after close — closing a controlled Reka dialog can
     * click-through / restore-focus onto the same AI nav control that opened it.
     */
    let paywallQuietUntilMs = 0
    const PAYWALL_REOPEN_QUIET_MS = 200

    const byId = computed(() => statusMap(packs.value))

    const catalogItems = computed<PackCatalogItem[]>(() =>
        PACK_CATALOG.map((def) => {
            const runtime = byId.value.get(def.id)
            let state = runtime?.state ?? (mode.value === 'open' ? 'active' : 'locked')
            // Standard build stubs these UIs — never show as active/trial in the store.
            if (!isPackRuntimeDeliverable(def.id)) {
                state = 'locked'
            }
            return {
                ...def,
                state,
                trialDaysLeft: runtime?.trialDaysLeft ?? null,
                expiresAt: runtime?.expiresAt ?? null,
            }
        }).sort((a, b) => a.order - b.order),
    )

    const capabilityPacks = computed(() =>
        catalogItems.value.filter((item) => item.category === 'capability'),
    )

    const connectorPacks = computed(() =>
        catalogItems.value.filter((item) => item.category === 'connector'),
    )

    const lockedCount = computed(
        () => catalogItems.value.filter((item) => item.state === 'locked' || item.state === 'expired').length,
    )

    const activeCount = computed(
        () => catalogItems.value.filter((item) => item.state === 'active' || item.state === 'trial').length,
    )

    function applySnapshot(snapshot: EntitlementSnapshot) {
        mode.value = snapshot.mode
        packs.value = snapshot.packs ?? []
        suiteId.value = snapshot.suiteId ?? null
        freeAiCallsRemaining.value =
            snapshot.freeAiCallsRemaining === undefined ? null : snapshot.freeAiCallsRemaining
        freeAiCallsDailyLimit.value =
            snapshot.freeAiCallsDailyLimit === undefined ? 3 : snapshot.freeAiCallsDailyLimit
        metaDocUsable.value =
            snapshot.metaDocUsable == null ? snapshot.mode !== 'enforced' : snapshot.metaDocUsable
        watermarkFooter.value = snapshot.watermarkFooter ?? null
        siteProTrialAvailable.value = snapshot.siteProTrialAvailable === true
        siteProTrialDays.value = snapshot.siteProTrialDays ?? 7
        heartbeatConfigured.value = snapshot.heartbeatConfigured === true
        heartbeatAt.value = snapshot.heartbeatAt ?? null
        ready.value = true
    }

    async function load(): Promise<void> {
        if (loading.value) return
        loading.value = true
        try {
            const snapshot = await packsApi.fetchEntitlement()
            applySnapshot(snapshot)
        } catch {
            applySnapshot(openSnapshot())
        } finally {
            loading.value = false
        }
    }

    async function refresh(): Promise<void> {
        loading.value = false
        await load()
    }

    async function startTrial(packId: PackId): Promise<void> {
        const snapshot = await packsApi.startTrial(packId)
        applySnapshot(snapshot)
        closePaywall()
    }

    async function claimSiteProTrial(): Promise<void> {
        const snapshot = await packsApi.claimSiteProTrial()
        applySnapshot(snapshot)
        closePaywall()
    }

    async function activateLicense(licenseKey: string): Promise<void> {
        const snapshot = await packsApi.activateLicense(licenseKey.trim())
        applySnapshot(snapshot)
        closePaywall()
    }

    function stateOf(packId: PackId): PackAccessState {
        if (mode.value === 'open') return 'active'
        return byId.value.get(packId)?.state ?? 'locked'
    }

    function isPackUsable(packId: PackId): boolean {
        // Standard edition cannot host stubbed pack UIs even when mode=open / licensed.
        if (!isPackRuntimeDeliverable(packId)) return false
        const state = stateOf(packId)
        return state === 'active' || state === 'trial'
    }

    function hasCapability(capability: string): boolean {
        if (mode.value === 'open') return true
        return catalogItems.value.some(
            (pack) =>
                isPackUsable(pack.id) && pack.capabilities.includes(capability),
        )
    }

    function isDbTypeAllowed(dbType: DbType): boolean {
        const packId = resolvePackForDbType(dbType)
        if (!packId) return true
        return isPackUsable(packId)
    }

    function packForDbType(dbType: DbType): PackId | null {
        return resolvePackForDbType(dbType)
    }

    function paywallKey(packId: PackId, context?: string | null): string {
        return `${packId}::${context ?? 'store'}`
    }

    function wasPaywallDismissed(packId: PackId, context?: string): boolean {
        return paywallDismissedKeys.value.has(paywallKey(packId, context))
    }

    function openPaywall(packId: PackId, context?: string) {
        if (!findPackDefinition(packId)) return
        if (Date.now() < paywallQuietUntilMs) return
        // Track keys for one-shot auto upsells (e.g. noteAiSqlGenerateSuccess).
        // Do not block user-initiated reopens (store / suite / nav) after quiet window.
        const key = paywallKey(packId, context)
        paywallShownKeys.value.add(key)
        paywallDismissedKeys.value.delete(key)
        paywallPackId.value = packId
        paywallContext.value = context ?? null
    }

    function closePaywall() {
        if (paywallPackId.value != null) {
            paywallDismissedKeys.value.add(paywallKey(paywallPackId.value, paywallContext.value))
        }
        paywallQuietUntilMs = Date.now() + PAYWALL_REOPEN_QUIET_MS
        paywallPackId.value = null
        paywallContext.value = null
    }

    /** Hybrid pack.ai or Offline AI SKU (pack.ai.offline). */
    function isAiUsable(): boolean {
        return isPackUsable('pack.ai') || isPackUsable(PACK_AI_OFFLINE_ID)
    }

    /** AI 导航：标准版构建始终 Paywall；已开通 / 仍有免费额度 → true */
    function guardAiNav(): boolean {
        if (import.meta.env.VITE_DATAWISE_EDITION === 'standard') {
            openPaywall('pack.ai', 'nav.ai')
            return false
        }
        if (isAiUsable()) return true
        if (
            mode.value === 'enforced' &&
            freeAiCallsRemaining.value != null &&
            freeAiCallsRemaining.value > 0
        ) {
            return true
        }
        const ctx =
            mode.value === 'enforced' && freeAiCallsRemaining.value === 0
                ? 'ai.quota'
                : 'nav.ai'
        openPaywall('pack.ai', ctx)
        return false
    }

    /**
     * B2-2 console lite (explain / fix): same free-quota gate as nav,
     * with lite paywall context when unpaid. Standard edition always false
     * (host stub shows local degrade tip + paywall).
     */
    function guardConsoleAiLite(
        context: 'console.ai.fix' | 'console.ai.explain' | 'console.ai.lite' = 'console.ai.lite',
    ): boolean {
        if (import.meta.env.VITE_DATAWISE_EDITION === 'standard') {
            openPaywall('pack.ai', context)
            return false
        }
        if (isAiUsable()) return true
        if (
            mode.value === 'enforced' &&
            freeAiCallsRemaining.value != null &&
            freeAiCallsRemaining.value > 0
        ) {
            return true
        }
        const ctx =
            mode.value === 'enforced' && freeAiCallsRemaining.value === 0
                ? 'ai.quota'
                : context
        openPaywall('pack.ai', ctx)
        return false
    }

    function noteAiCallConsumed(): void {
        if (mode.value !== 'enforced' || isAiUsable()) return
        if (freeAiCallsRemaining.value == null) return
        freeAiCallsRemaining.value = Math.max(0, freeAiCallsRemaining.value - 1)
    }

    /**
     * §1.2: after a successful console SQL generate on the free tier,
     * open a one-shot paywall and signal the caller to show an upsell toast.
     */
    function noteAiSqlGenerateSuccess(): boolean {
        noteAiCallConsumed()
        if (mode.value !== 'enforced' || isAiUsable()) return false
        const key = 'pack.ai::ai.sqlSuccess'
        if (paywallShownKeys.value.has(key)) return false
        openPaywall('pack.ai', 'ai.sqlSuccess')
        return true
    }

    function handlePackEntitlementError(
        errorCode: string | undefined | null,
        packId?: string | null,
    ): boolean {
        if (!errorCode) return false
        if (errorCode === 'QUOTA_EXCEEDED' || errorCode === 'TENANT_AI_QUOTA_EXCEEDED') {
            void refresh()
            openPaywall('pack.ai', 'ai.quota')
            return true
        }
        if (
            errorCode === 'LICENSE_REQUIRED' ||
            errorCode === 'PACK_NOT_INSTALLED' ||
            errorCode === 'LICENSE_EXPIRED'
        ) {
            void refresh()
            const resolved = (packId && findPackDefinition(packId as PackId)
                ? packId
                : packId?.startsWith('suite.')
                  ? 'pack.governance'
                  : 'pack.ai') as PackId
            const ctx = packId?.startsWith('suite.')
                ? 'metadoc.enterprise'
                : resolved.startsWith('pack.connector')
                  ? `connection.${resolved}`
                  : resolved === 'pack.ai'
                    ? 'nav.ai'
                    : 'store'
            openPaywall(resolved, ctx)
            return true
        }
        return false
    }

    /** @deprecated prefer handlePackEntitlementError */
    function handleAiEntitlementError(errorCode: string | undefined | null): boolean {
        return handlePackEntitlementError(errorCode, 'pack.ai')
    }

    /** 任意扩展包导航门禁 */
    function guardPack(packId: PackId, context?: string): boolean {
        if (isPackUsable(packId)) return true
        openPaywall(packId, context ?? 'store')
        return false
    }

    /** MetaDoc：Enterprise / Platform 套餐能力 */
    function guardMetaDoc(): boolean {
        if (mode.value === 'open' || metaDocUsable.value) return true
        openPaywall('pack.governance', 'metadoc.enterprise')
        return false
    }

    /** Dev 生产力：Pro / Enterprise / Platform 套餐赠送 */
    function guardDevProductivity(context = 'dev.productivity'): boolean {
        if (
            hasDevProductivityAccess({
                mode: mode.value,
                suiteId: suiteId.value,
            })
        ) {
            return true
        }
        // Pro includes AI — surface AI pack paywall with suite-oriented context copy.
        openPaywall('pack.ai', context)
        return false
    }

    /** 建连：可用则 true；否则打开对应连接器包 Paywall */
    function guardDbType(dbType: DbType): boolean {
        const packId = resolvePackForDbType(dbType)
        if (!packId || isPackUsable(packId)) return true
        openPaywall(packId, `connection.${dbType}`)
        return false
    }

    return {
        ready,
        loading,
        mode,
        packs,
        suiteId,
        freeAiCallsRemaining,
        freeAiCallsDailyLimit,
        metaDocUsable,
        watermarkFooter,
        siteProTrialAvailable,
        siteProTrialDays,
        heartbeatConfigured,
        heartbeatAt,
        paywallPackId,
        paywallContext,
        catalogItems,
        capabilityPacks,
        connectorPacks,
        lockedCount,
        activeCount,
        load,
        refresh,
        startTrial,
        claimSiteProTrial,
        activateLicense,
        stateOf,
        isPackUsable,
        isAiUsable,
        hasCapability,
        isDbTypeAllowed,
        packForDbType,
        openPaywall,
        closePaywall,
        wasPaywallDismissed,
        guardAiNav,
        guardConsoleAiLite,
        noteAiCallConsumed,
        noteAiSqlGenerateSuccess,
        handleAiEntitlementError,
        handlePackEntitlementError,
        guardPack,
        guardMetaDoc,
        guardDevProductivity,
        guardDbType,
    }
})
