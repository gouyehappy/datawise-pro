/** Parse a pasted Nacos console URL and resolve version / r-nacos / namespace prefs. */

import {
    readAdvancedProperty,
    removeAdvancedProperty,
    upsertAdvancedProperty,
} from '@/features/connection/utils/advanced-config'

export {
    readAdvancedProperty,
    removeAdvancedProperty,
    upsertAdvancedProperty,
} from '@/features/connection/utils/advanced-config'

export type NacosImplementation = 'nacos' | 'rnacos'
export type NacosVersionMode = 'auto' | 'v2' | 'v3'

export const NACOS_IMPLEMENTATION_KEY = 'nacosImplementation'
export const NACOS_VERSION_MODE_KEY = 'nacosVersionMode'
export const NACOS_NAMESPACE_KEY = 'namespace'
export const NACOS_CONTEXT_CUSTOM_KEY = 'nacosContextCustom'

export type ParsedNacosConsoleAddress = {
    host: string
    port?: string
    https?: boolean
    /**
     * Set when the input had a scheme or path.
     * `/` means the URL had no context path; an explicit path is kept as-is.
     */
    contextPath?: string
}

const CONSOLE_SUFFIXES = ['/index.html', '/next']

export function parseNacosConsoleAddress(raw: string): ParsedNacosConsoleAddress | null {
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
    } else if (lower.startsWith('nacos://')) {
        remainder = text.slice('nacos://'.length)
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
    path = stripConsoleSuffixes(path)

    const split = splitHostPort(hostPort)
    if (!split) return null

    const parsed: ParsedNacosConsoleAddress = {host: split.host}
    if (split.port) parsed.port = split.port
    if (https !== undefined) parsed.https = https
    if (slash >= 0 || lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('nacos://')) {
        parsed.contextPath = normalizeNacosContextPath(path) || '/'
    }
    return parsed
}

export function readNacosImplementation(advancedConfig?: string): NacosImplementation {
    return readAdvancedProperty(advancedConfig, NACOS_IMPLEMENTATION_KEY) === 'rnacos' ? 'rnacos' : 'nacos'
}

export function readNacosVersionMode(advancedConfig?: string): NacosVersionMode {
    if (readNacosImplementation(advancedConfig) === 'rnacos') return 'auto'
    const value = readAdvancedProperty(advancedConfig, NACOS_VERSION_MODE_KEY)
    return value === 'v2' || value === 'v3' ? value : 'auto'
}

export function readSavedNacosNamespace(advancedConfig?: string): string {
    return readAdvancedProperty(advancedConfig, NACOS_NAMESPACE_KEY)?.trim() ?? ''
}

/** `null` means every namespace. Empty array means none. `''` is public. */
export const NACOS_VISIBLE_NAMESPACES_KEY = 'visibleNamespaces'
const NACOS_PUBLIC_NAMESPACE_TOKEN = 'public'
const NACOS_NONE_NAMESPACE_TOKEN = '__none__'

export function readVisibleNacosNamespaces(advancedConfig?: string): string[] | null {
    const raw = readAdvancedProperty(advancedConfig, NACOS_VISIBLE_NAMESPACES_KEY)
    if (raw == null) return null
    if (raw === NACOS_NONE_NAMESPACE_TOKEN) return []
    return raw.split('|').map((part) => part.trim()).filter(Boolean).map((part) => (
        part === NACOS_PUBLIC_NAMESPACE_TOKEN ? '' : part
    ))
}

export function formatVisibleNacosNamespaces(ids: string[]): string {
    if (!ids.length) return NACOS_NONE_NAMESPACE_TOKEN
    const unique = [...new Set(ids.map((id) => id.trim()))]
    return unique.map((id) => (id ? id : NACOS_PUBLIC_NAMESPACE_TOKEN)).join('|')
}

export function isNacosNamespaceAllowed(namespaceId: string, advancedConfig?: string): boolean {
    const allowed = readVisibleNacosNamespaces(advancedConfig)
    if (!allowed) return true
    return allowed.includes(namespaceId)
}

/** r-nacos / 2.x use `/nacos`. 3.x and an auto 8080 console use `/`. */
export function defaultNacosContextPath(
    implementation: NacosImplementation,
    versionMode: NacosVersionMode,
    port?: string,
): string {
    if (implementation === 'rnacos' || versionMode === 'v2') return '/nacos'
    if (versionMode === 'v3') return '/'
    return (port ?? '').trim() === '8080' ? '/' : '/nacos'
}

export function nacosConsolePlaceholder(
    implementation: NacosImplementation,
    versionMode: NacosVersionMode,
): string {
    if (implementation === 'rnacos' || versionMode === 'v2') return 'http://127.0.0.1:8848/nacos'
    return 'http://127.0.0.1:8080'
}

export function nacosApiFamily(
    implementation: NacosImplementation,
    versionMode: NacosVersionMode,
    port?: string,
    contextPath?: string,
): 'v1' | 'v3' {
    if (implementation === 'rnacos' || versionMode === 'v2') return 'v1'
    if (versionMode === 'v3') return 'v3'
    const path = normalizeNacosContextPath(contextPath ?? '')
    if (!path) return (port ?? '').trim() === '8848' ? 'v1' : 'v3'
    return 'v1'
}

/** r-nacos web console (often :10848) is not the OpenAPI address. */
export function isRNacosWebConsoleAddress(raw: string): boolean {
    return parseNacosConsoleAddress(raw)?.port === '10848'
}

export function formatNacosConsoleAddress(
    host: string,
    port: string,
    advancedConfig?: string,
): string {
    const embedded = host.includes('://') || host.toLowerCase().startsWith('nacos://')
        ? parseNacosConsoleAddress(host)
        : null
    const resolvedHost = (embedded?.host || host.trim() || 'localhost').replace(/^\[|\]$/g, '')
    const resolvedPort = embedded?.port || port.trim() || '8848'
    const httpsLine = readAdvancedProperty(advancedConfig, 'useHttps')
    const https = httpsLine != null
        ? httpsLine === 'true' || httpsLine === '1'
        : (embedded?.https ?? false)
    const storedContext = readAdvancedProperty(advancedConfig, 'contextPath')
    const fallback = defaultNacosContextPath(
        readNacosImplementation(advancedConfig),
        readNacosVersionMode(advancedConfig),
        resolvedPort,
    )
    const rawContext = storedContext ?? embedded?.contextPath ?? fallback
    const context = rawContext === '/' ? '' : (normalizeNacosContextPath(rawContext) || '')
    return `${https ? 'https' : 'http'}://${resolvedHost}:${resolvedPort}${context}`
}

function stripConsoleSuffixes(path: string): string {
    let value = path
    let changed = true
    while (changed) {
        changed = false
        const lower = value.toLowerCase()
        for (const suffix of CONSOLE_SUFFIXES) {
            if (!lower.endsWith(suffix)) continue
            value = value.slice(0, value.length - suffix.length)
            changed = true
            break
        }
        while (value.endsWith('/')) value = value.slice(0, -1)
    }
    return value
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

function normalizeNacosContextPath(contextPath: string): string {
    let value = contextPath.trim()
    if (!value || value === '/') return ''
    if (!value.startsWith('/')) value = `/${value}`
    while (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1)
    return value
}
