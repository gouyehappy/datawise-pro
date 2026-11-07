/**
 * Paste-friendly HTTP(S) endpoint parsing for Jenkins / Polaris / YARN / Kubernetes.
 */

import {
    readAdvancedProperty,
    upsertAdvancedProperty,
} from '@/features/connection/utils/advanced-config'

export type ParsedHttpEndpoint = {
    host: string
    port?: string
    https?: boolean
    /** `/` when the URL had a scheme/path but no context; otherwise a path or undefined. */
    path?: string
}

export type HttpEndpointKind = 'jenkins' | 'polaris' | 'yarn' | 'kubernetes'

const JENKINS_UI_SUFFIXES = new Set([
    'login', 'logout', 'signup', 'securityrealm', 'asynchpeople', 'manage', 'configure', 'api',
])

const YARN_UI_SUFFIXES = [
    '/cluster/apps',
    '/cluster/nodes',
    '/cluster/scheduler',
    '/cluster',
]

export function parseHttpEndpoint(raw: string, kind: HttpEndpointKind): ParsedHttpEndpoint | null {
    const text = raw.trim()
    if (!text) return null

    let https: boolean | undefined
    let remainder = text
    const lower = text.toLowerCase()
    if (lower.startsWith('https://')) {
        https = true
        remainder = text.slice('https://'.length)
    } else if (lower.startsWith('http://')) {
        https = false
        remainder = text.slice('http://'.length)
    } else if (lower.startsWith(`${kind}://`)) {
        remainder = text.slice(kind.length + 3)
    }

    const slash = remainder.indexOf('/')
    let hostPort = remainder
    let path = ''
    if (slash >= 0) {
        hostPort = remainder.slice(0, slash)
        path = remainder.slice(slash)
    }
    const query = path.search(/[?#]/)
    if (query >= 0) path = path.slice(0, query)

    const split = splitHostPort(hostPort)
    if (!split) return null

    const parsed: ParsedHttpEndpoint = {host: split.host}
    if (split.port) parsed.port = split.port
    if (https !== undefined) parsed.https = https

    if (slash >= 0 || lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith(`${kind}://`)) {
        parsed.path = normalizeEndpointPath(refinePathForKind(path, kind)) || '/'
    }
    return parsed
}

export function formatHttpEndpoint(
    kind: HttpEndpointKind,
    host: string,
    port: string,
    advancedConfig?: string,
): string {
    const embedded = host.includes('://')
        ? parseHttpEndpoint(host, kind)
        : null
    const resolvedHost = (embedded?.host || host.trim() || 'localhost').replace(/^\[|\]$/g, '')
    const defaults = endpointDefaults(kind)
    const resolvedPort = embedded?.port || port.trim() || defaults.port
    const httpsLine = readAdvancedProperty(advancedConfig, 'useHttps')
    const https = httpsLine != null
        ? httpsLine === 'true' || httpsLine === '1'
        : (embedded?.https ?? defaults.https)
    const pathKey = defaults.pathKey
    const storedPath = pathKey ? readAdvancedProperty(advancedConfig, pathKey) : undefined
    const rawPath = storedPath ?? embedded?.path ?? defaults.path
    const path = rawPath === '/' ? '' : (normalizeEndpointPath(rawPath) || '')
    return `${https ? 'https' : 'http'}://${resolvedHost}:${resolvedPort}${path}`
}

export function applyParsedHttpEndpoint(
    kind: HttpEndpointKind,
    parsed: ParsedHttpEndpoint,
    current: {host: string; port: string; advancedConfig?: string},
): {host: string; port: string; advancedConfig: string} {
    const defaults = endpointDefaults(kind)
    let advanced = current.advancedConfig ?? ''
    const host = parsed.host
    const port = parsed.port || current.port || defaults.port
    if (parsed.https !== undefined) {
        advanced = upsertAdvancedProperty(advanced, 'useHttps', parsed.https ? 'true' : 'false')
    } else if (defaults.https && readAdvancedProperty(advanced, 'useHttps') == null) {
        advanced = upsertAdvancedProperty(advanced, 'useHttps', 'true')
    }
    if (defaults.pathKey && parsed.path) {
        const path = parsed.path === '/' ? (defaults.path || '/') : parsed.path
        if (path && path !== '/') {
            advanced = upsertAdvancedProperty(advanced, defaults.pathKey, path)
        } else if (defaults.path) {
            advanced = upsertAdvancedProperty(advanced, defaults.pathKey, defaults.path)
        }
    }
    return {host, port, advancedConfig: advanced}
}

export function endpointDefaults(kind: HttpEndpointKind): {
    port: string
    https: boolean
    pathKey?: 'contextPath' | 'restPath'
    path?: string
    placeholder: string
} {
    switch (kind) {
        case 'jenkins':
            return {
                port: '8080',
                https: false,
                pathKey: 'contextPath',
                path: '',
                placeholder: 'http://127.0.0.1:8080/jenkins',
            }
        case 'polaris':
            return {
                port: '8090',
                https: false,
                pathKey: 'contextPath',
                path: '',
                placeholder: 'http://127.0.0.1:8090',
            }
        case 'yarn':
            return {
                port: '8088',
                https: false,
                pathKey: 'restPath',
                path: '/ws/v1/cluster',
                placeholder: 'http://127.0.0.1:8088',
            }
        case 'kubernetes':
            return {
                port: '6443',
                https: true,
                placeholder: 'https://127.0.0.1:6443',
            }
    }
}

function refinePathForKind(path: string, kind: HttpEndpointKind): string {
    let value = path.trim()
    if (!value) return ''
    if (kind === 'jenkins') return extractJenkinsContextPath(value)
    if (kind === 'yarn') return extractYarnRestPath(value)
    if (kind === 'kubernetes') return ''
    return value
}

function extractJenkinsContextPath(path: string): string {
    let value = path
    while (value.endsWith('/')) value = value.slice(0, -1)
    if (!value || value === '/') return ''
    const segments = value.split('/')
    if (segments.length >= 3) {
        const last = segments[segments.length - 1]?.toLowerCase() ?? ''
        if (JENKINS_UI_SUFFIXES.has(last)) {
            const ctx = segments.slice(1, -1).filter(Boolean)
            return ctx.length ? `/${ctx.join('/')}` : ''
        }
    }
    if (segments.length >= 2 && segments[1]) {
        const first = segments[1].toLowerCase()
        if (!JENKINS_UI_SUFFIXES.has(first)) return `/${segments[1]}`
    }
    return ''
}

function extractYarnRestPath(path: string): string {
    let value = path
    while (value.endsWith('/')) value = value.slice(0, -1)
    const lower = value.toLowerCase()
    if (lower.includes('/ws/v1/cluster')) {
        const idx = lower.indexOf('/ws/v1/cluster')
        return value.slice(0, idx + '/ws/v1/cluster'.length)
    }
    for (const suffix of YARN_UI_SUFFIXES) {
        if (lower === suffix || lower.endsWith(suffix)) return '/ws/v1/cluster'
    }
    return value || '/ws/v1/cluster'
}

function splitHostPort(hostPort: string): {host: string; port?: string} | null {
    const raw = hostPort.trim()
    if (!raw) return null
    if (raw.startsWith('[') && raw.includes(']:')) {
        const end = raw.indexOf(']:')
        const host = raw.slice(1, end).trim()
        const port = raw.slice(end + 2).trim()
        if (!host || !/^\d+$/.test(port)) return host ? {host} : null
        return {host, port}
    }
    const colon = raw.lastIndexOf(':')
    if (colon > 0 && !raw.includes(']')) {
        const maybePort = raw.slice(colon + 1)
        if (/^\d+$/.test(maybePort)) {
            const host = raw.slice(0, colon).trim()
            return host ? {host, port: maybePort} : null
        }
    }
    const host = raw.replace(/^\[|\]$/g, '').trim()
    return host ? {host} : null
}

function normalizeEndpointPath(path: string | undefined): string {
    if (!path) return ''
    let value = path.trim()
    if (!value || value === '/') return ''
    if (!value.startsWith('/')) value = `/${value}`
    while (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1)
    return value
}
