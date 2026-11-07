export interface DeepLinkOpenPayload {
    connectionId?: string
    database?: string
    sql?: string
}

export const DEEP_LINK_SCHEME = 'datawise'
export const DEEP_LINK_HOST = 'open'

export function buildDeepLinkUrl(params: DeepLinkOpenPayload): string {
    const url = new URL(`${DEEP_LINK_SCHEME}://${DEEP_LINK_HOST}`)
    if (params.connectionId) url.searchParams.set('connectionId', params.connectionId)
    if (params.database) url.searchParams.set('database', params.database)
    if (params.sql) url.searchParams.set('sql', params.sql)
    return url.toString()
}

export function resolveSqlFromEditorText(fullText: string, selectedText: string, hasSelection: boolean): string {
    const source = hasSelection ? selectedText : fullText
    return source.trim()
}
