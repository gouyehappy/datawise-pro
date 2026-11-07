export type ConnectorPluginLoadFailure = {
    jarName: string
    reason: string
}

/** Strip QUARANTINED: prefix for i18n / tip lookup. */
export function normalizePluginFailureReason(reason: string | null | undefined): string {
    const raw = (reason ?? '').trim()
    if (!raw) return 'UNKNOWN'
    if (raw.startsWith('QUARANTINED:')) {
        const inner = raw.slice('QUARANTINED:'.length).trim()
        return inner || 'UNKNOWN'
    }
    return raw
}

export function isQuarantinedPluginFailure(reason: string | null | undefined): boolean {
    return (reason ?? '').startsWith('QUARANTINED:')
}

const KNOWN_REASONS = new Set([
    'INTEGRITY_MISMATCH',
    'INTEGRITY_CHECK_FAILED',
    'MANIFEST_MISSING',
    'MANIFEST_ENTRY_MISSING',
    'MANIFEST_SHA_MISSING',
    'NO_SPI_PROVIDERS',
    'RUNTIME_COPY_LOCKED',
    'UNKNOWN',
])

export function pluginFailureReasonKey(reason: string | null | undefined): string {
    const normalized = normalizePluginFailureReason(reason)
    if (KNOWN_REASONS.has(normalized)) {
        return `plugin.connectorMarket.failureReasons.${normalized}`
    }
    return 'plugin.connectorMarket.failureReasons.GENERIC'
}

export function pluginFailureTipKey(reason: string | null | undefined): string {
    const normalized = normalizePluginFailureReason(reason)
    if (KNOWN_REASONS.has(normalized)) {
        return `plugin.connectorMarket.failureTips.${normalized}`
    }
    return 'plugin.connectorMarket.failureTips.GENERIC'
}
