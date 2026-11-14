/**
 * T-TRUNC-1：跨 AI / MCP / CLI / Workbench 的统一截断元数据（加法字段）。
 * 行级分页仍用 hasMore / cursor*；本类型只描述「内容被上限截断」。
 */

export type TruncationUnit = 'chars' | 'bytes' | 'rows' | 'items' | 'tables'

export type TruncationReason = 'preview' | 'safety' | 'window' | 'cap' | 'token_budget'

export interface TruncationMeta {
    truncated: boolean
    originalLength?: number
    limit?: number
    unit?: TruncationUnit
    reason?: TruncationReason
}

export interface TruncateTextResult {
    text: string
    truncation: TruncationMeta
}

export function truncateTextWithMeta(
    raw: string,
    limit: number,
    options?: {
        unit?: TruncationUnit
        reason?: TruncationReason
        /** 截断后是否追加省略标记（仅展示用；meta.limit 仍为 limit） */
        ellipsis?: string
    },
): TruncateTextResult {
    const unit = options?.unit ?? 'chars'
    const reason = options?.reason
    const originalLength = raw.length
    if (limit <= 0) {
        return {
            text: '',
            truncation: {truncated: originalLength > 0, originalLength, limit, unit, reason},
        }
    }
    if (originalLength <= limit) {
        return {
            text: raw,
            truncation: {truncated: false, originalLength, limit, unit, reason},
        }
    }
    const slice = raw.slice(0, limit)
    const ellipsis = options?.ellipsis
    return {
        text: ellipsis ? `${slice}${ellipsis}` : slice,
        truncation: {truncated: true, originalLength, limit, unit, reason},
    }
}

export function truncationMeta(
    truncated: boolean,
    originalLength: number,
    limit: number,
    unit: TruncationUnit = 'chars',
    reason?: TruncationReason,
): TruncationMeta {
    return {truncated, originalLength, limit, unit, ...(reason ? {reason} : {})}
}
