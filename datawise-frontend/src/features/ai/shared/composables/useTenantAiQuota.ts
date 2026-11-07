import {computed, ref} from 'vue'
import {tenantsApi} from '@/api'
import {
    isTenantAiQuotaExhausted,
    isTenantAiQuotaNearLimit,
} from '@/features/ai/shared/services/tenant-ai-quota.service'
import type {TenantAiUsage} from '@/shared/api/types'

const cachedUsage = ref<TenantAiUsage | null>(null)
const loading = ref(false)
let inFlight: Promise<TenantAiUsage | null> | null = null

async function fetchUsage(): Promise<TenantAiUsage | null> {
    if (inFlight) return inFlight
    loading.value = true
    inFlight = tenantsApi.aiUsage()
        .then((usage) => {
            cachedUsage.value = usage
            return usage
        })
        .catch(() => null)
        .finally(() => {
            loading.value = false
            inFlight = null
        })
    return inFlight
}

/** Cached tenant AI quota for the AI workbench. */
export function useTenantAiQuota() {
    const usage = computed(() => cachedUsage.value)
    const limited = computed(() => !!usage.value && !usage.value.unlimited)
    const nearLimit = computed(() => isTenantAiQuotaNearLimit(usage.value))
    const exhausted = computed(() => isTenantAiQuotaExhausted(usage.value))

    async function refresh(force = false) {
        if (!force && cachedUsage.value != null) {
            return cachedUsage.value
        }
        return fetchUsage()
    }

    /** Re-fetch when the tenant has a configured cap (skip for unlimited). */
    async function refreshIfLimited() {
        if (usage.value?.unlimited) return usage.value
        return fetchUsage()
    }

    return {
        usage,
        loading,
        limited,
        nearLimit,
        exhausted,
        refresh,
        refreshIfLimited,
    }
}
