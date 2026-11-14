/** T-TRUNC-1 shared truncation meta (mirrors FE / BE TruncationMeta). */

export type TruncationUnit = 'chars' | 'bytes' | 'rows' | 'items' | 'tables'

export type TruncationReason = 'preview' | 'safety' | 'window' | 'cap' | 'token_budget'

export interface TruncationMeta {
    truncated: boolean
    originalLength?: number
    limit?: number
    unit?: TruncationUnit
    reason?: TruncationReason
}

export function truncationMeta(
    truncated: boolean,
    originalLength: number,
    limit: number,
    unit: TruncationUnit,
    reason?: TruncationReason,
): TruncationMeta {
    return {truncated, originalLength, limit, unit, ...(reason ? {reason} : {})}
}
