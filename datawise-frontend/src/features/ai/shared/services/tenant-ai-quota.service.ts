import type {TenantAiUsage} from '@/shared/api/types'

/** True when tenant has a finite daily cap and no calls remain. */
export function isTenantAiQuotaExhausted(usage: TenantAiUsage | null | undefined): boolean {
    return !!usage && !usage.unlimited && usage.remaining === 0
}

/**
 * True when quota is finite and remaining is ≤10% of limit or ≤5 calls
 * (whichever threshold fires first). Exhausted usage is not "near limit".
 */
export function isTenantAiQuotaNearLimit(usage: TenantAiUsage | null | undefined): boolean {
    if (!usage || usage.unlimited || usage.limit <= 0 || usage.remaining <= 0) {
        return false
    }
    return usage.remaining <= 5 || usage.remaining / usage.limit <= 0.1
}
