/** True when the server capped rows but offers no cursor to page further (federated JOIN). */
export function isResultTruncatedAtCap(result: {
    hasMore?: boolean
    cursorId?: string | null
} | null | undefined): boolean {
    return Boolean(result?.hasMore && !result.cursorId)
}
