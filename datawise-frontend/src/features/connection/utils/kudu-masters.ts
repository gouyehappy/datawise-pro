import {
    readAdvancedProperty,
    removeAdvancedProperty,
    upsertAdvancedProperty,
} from '@/features/connection/utils/advanced-config'

const MASTERS = 'kudu.masters'
const DEFAULT_PORT = '7051'

/** Cluster masters as one address list. Exact text lives in advancedConfig so typing does not jump. */
export function readKuduMasters(form: {
    host?: string
    port?: string
    advancedConfig?: string
}): string {
    const stored = readAdvancedProperty(form.advancedConfig, MASTERS)
    if (stored) return stored.replace(/^kudu:\/\//, '')
    const host = form.host?.trim().replace(/^kudu:\/\//, '') || ''
    if (!host) return `localhost:${DEFAULT_PORT}`
    if (host.includes(',') || host.includes(':')) return host
    const port = form.port?.trim() || DEFAULT_PORT
    return `${host}:${port}`
}

export function applyKuduMasters(
    form: {host: string; port: string; advancedConfig?: string},
    value: string,
): void {
    const trimmed = value.trim().replace(/^kudu:\/\//, '')
    form.advancedConfig = trimmed
        ? upsertAdvancedProperty(form.advancedConfig, MASTERS, trimmed)
        : removeAdvancedProperty(form.advancedConfig, MASTERS)
    syncHostPort(form, trimmed)
}

function syncHostPort(form: {host: string; port: string}, masters: string): void {
    if (!masters) {
        form.host = 'localhost'
        form.port = DEFAULT_PORT
        return
    }
    if (masters.includes(',')) {
        form.host = masters
        form.port = portOf(masters.split(',')[0] || '') || DEFAULT_PORT
        return
    }
    const port = portOf(masters)
    if (port) {
        form.host = masters.slice(0, masters.lastIndexOf(':'))
        form.port = port
        return
    }
    form.host = masters
    form.port = DEFAULT_PORT
}

function portOf(address: string): string | undefined {
    const colon = address.lastIndexOf(':')
    if (colon <= 0) return undefined
    const port = address.slice(colon + 1)
    return /^\d+$/.test(port) ? port : undefined
}
