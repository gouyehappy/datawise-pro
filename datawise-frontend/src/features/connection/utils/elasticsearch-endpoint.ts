/** Elasticsearch advancedConfig helpers (key=value lines on ConnectionEntity). */

import {
    readAdvancedProperty,
    removeAdvancedProperty,
    upsertAdvancedProperty,
} from '@/features/connection/utils/advanced-config'

export type ElasticsearchConnectionMode = 'direct' | 'kibana'

export function elasticsearchConnectionMode(advancedConfig: string | undefined): ElasticsearchConnectionMode {
    const mode = readAdvancedProperty(advancedConfig, 'mode')
    if (mode?.toLowerCase() === 'kibana') return 'kibana'
    const enabled = readAdvancedProperty(advancedConfig, 'kibanaProxyEnabled')
    if (enabled && /^(true|1|yes|on)$/i.test(enabled)) return 'kibana'
    return 'direct'
}

export function normalizeKibanaBasePath(value: string): string {
    const path = value.trim().replace(/^\/+|\/+$/g, '')
    return path ? `/${path}` : ''
}

export function normalizeElasticsearchConnectivityCheckPath(value: string): string {
    const raw = value.trim()
    if (!raw) return ''
    const line = raw.split(/\r?\n/, 1)[0]?.trim() ?? ''
    const withoutMethod = line.replace(/^GET\s+/i, '').trim()
    if (!withoutMethod || withoutMethod === '/') return ''
    return withoutMethod.startsWith('/') ? withoutMethod : `/${withoutMethod}`
}

export function applyElasticsearchEndpointOptions(
    advancedConfig: string | undefined,
    options: {
        mode?: ElasticsearchConnectionMode
        kibanaBasePath?: string
        connectivityCheckPath?: string
        connectivityCheckDisabled?: boolean
        useHttps?: boolean
        insecureSkipTlsVerify?: boolean
    },
): string {
    let next = advancedConfig ?? ''
    const mode = options.mode ?? 'direct'
    if (mode === 'kibana') {
        next = upsertAdvancedProperty(next, 'mode', 'kibana')
        next = removeAdvancedProperty(next, 'kibanaProxyEnabled')
        const base = normalizeKibanaBasePath(options.kibanaBasePath ?? '')
        next = base
            ? upsertAdvancedProperty(next, 'kibanaBasePath', base)
            : removeAdvancedProperty(next, 'kibanaBasePath')
    } else {
        next = removeAdvancedProperty(next, 'mode')
        next = removeAdvancedProperty(next, 'kibanaProxyEnabled')
        next = removeAdvancedProperty(next, 'kibanaBasePath')
    }

    const checkPath = normalizeElasticsearchConnectivityCheckPath(options.connectivityCheckPath ?? '')
    next = checkPath
        ? upsertAdvancedProperty(next, 'connectivityCheckPath', checkPath)
        : removeAdvancedProperty(next, 'connectivityCheckPath')

    next = options.connectivityCheckDisabled
        ? upsertAdvancedProperty(next, 'connectivityCheckDisabled', 'true')
        : removeAdvancedProperty(next, 'connectivityCheckDisabled')

    next = options.useHttps
        ? upsertAdvancedProperty(next, 'useHttps', 'true')
        : removeAdvancedProperty(next, 'useHttps')

    next = options.insecureSkipTlsVerify
        ? upsertAdvancedProperty(next, 'insecureSkipTlsVerify', 'true')
        : removeAdvancedProperty(next, 'insecureSkipTlsVerify')

    return next
}
