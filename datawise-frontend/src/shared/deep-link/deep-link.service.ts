import type {DeepLinkAction, DeepLinkOpenPayload} from './deep-link.types'

export const DEEP_LINK_SCHEME = 'datawise'

const ACTION_HOSTS = new Set<DeepLinkAction>([
    'open',
    'connection-new',
    'ai',
    'plugin-install',
    'analysis-canvas',
])

function resolveDeepLinkHost(url: URL): string {
    if (url.hostname) return url.hostname
    return url.pathname.replace(/^\/+/, '').split('/')[0] ?? ''
}

function normalizeAction(host: string, pathname: string): DeepLinkAction | null {
    const pathTail = pathname.replace(/^\/+/, '').split('/').filter(Boolean)
    if (host === 'connection' && pathTail[0] === 'new') return 'connection-new'
    if (host === 'plugin' && pathTail[0] === 'install') return 'plugin-install'
    if (host === 'analysis' && pathTail[0] === 'canvas') return 'analysis-canvas'
    if (ACTION_HOSTS.has(host as DeepLinkAction)) return host as DeepLinkAction
    return null
}

export function parseDeepLinkUrl(raw: string): DeepLinkOpenPayload | null {
    const trimmed = raw.trim()
    if (!trimmed) return null

    try {
        const url = new URL(trimmed)
        if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return null
        const host = resolveDeepLinkHost(url)
        const action = normalizeAction(host, url.pathname)
        if (!action) return null

        const connectionId = url.searchParams.get('connectionId')?.trim() || undefined
        const database = url.searchParams.get('database')?.trim() || undefined
        const sql = url.searchParams.get('sql')?.trim() || undefined
        const dbType = url.searchParams.get('dbType')?.trim() || undefined
        const pluginId = url.searchParams.get('id')?.trim()
            || url.searchParams.get('pluginId')?.trim()
            || undefined

        if (action === 'open' && !connectionId && !database && !sql) return null
        if (action === 'connection-new') {
            return {action, dbType}
        }
        if (action === 'plugin-install') {
            if (!pluginId) return null
            return {action, pluginId}
        }
        if (action === 'ai' || action === 'analysis-canvas') {
            return {action, connectionId, database}
        }
        return {action, connectionId, database, sql}
    } catch {
        return null
    }
}

export function buildDeepLinkUrl(params: DeepLinkOpenPayload): string {
    const pathByAction: Record<DeepLinkAction, string> = {
        open: 'open',
        'connection-new': 'connection/new',
        ai: 'ai',
        'plugin-install': 'plugin/install',
        'analysis-canvas': 'analysis/canvas',
    }
    const url = new URL(`${DEEP_LINK_SCHEME}://${pathByAction[params.action]}`)
    if (params.connectionId) url.searchParams.set('connectionId', params.connectionId)
    if (params.database) url.searchParams.set('database', params.database)
    if (params.sql) url.searchParams.set('sql', params.sql)
    if (params.dbType) url.searchParams.set('dbType', params.dbType)
    if (params.pluginId) url.searchParams.set('id', params.pluginId)
    return url.toString()
}

export function buildDeepLinkExample(): string {
    return buildDeepLinkUrl({
        action: 'open',
        connectionId: 'your-connection-id',
        database: 'mydb',
        sql: 'SELECT 1',
    })
}

export function extractDeepLinkFromArgv(argv: string[]): string | null {
    return argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`)) ?? null
}
