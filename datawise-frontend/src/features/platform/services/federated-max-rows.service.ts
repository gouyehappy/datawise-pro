export const FEDERATED_DEFAULT_MAX_ROWS = 1_000
export const FEDERATED_HARD_MAX_ROWS = 10_000

const FEDERATED_MAX_ROWS_STEPS = [1_000, 5_000, 10_000] as const

/** Positive requested maxRows, else default; capped at federated hard limit. */
export function resolveFederatedMaxRows(requested?: number | null): number {
    const rows = requested != null && requested > 0 ? requested : FEDERATED_DEFAULT_MAX_ROWS
    return Math.min(rows, FEDERATED_HARD_MAX_ROWS)
}

/** Next step above current (1k → 5k → 10k); null when already at hard cap. */
export function nextFederatedMaxRows(current: number): number | null {
    const resolved = resolveFederatedMaxRows(current)
    if (resolved >= FEDERATED_HARD_MAX_ROWS) return null
    for (const step of FEDERATED_MAX_ROWS_STEPS) {
        if (step > resolved) return step
    }
    return FEDERATED_HARD_MAX_ROWS
}

export function canRaiseFederatedMaxRows(current: number): boolean {
    return nextFederatedMaxRows(current) != null
}
