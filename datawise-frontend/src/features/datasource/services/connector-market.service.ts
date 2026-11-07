import type {
    ConnectorMarketBundle,
    ConnectorMarketEntry,
} from '@/features/datasource/types/datasource.types'

export async function fetchConnectorMarketBundle(): Promise<ConnectorMarketBundle> {
    const {datasourcesApi} = await import('@/api')
    const data = await datasourcesApi.market()
    return {
        connectors: data.connectors,
        loadedPluginJars: data.loadedPluginJars ?? [],
        pluginLoadFailures: data.pluginLoadFailures ?? [],
        manifest: data.manifest ?? null,
    }
}

export function filterConnectorMarketEntries(
    entries: ConnectorMarketEntry[],
    query: string,
): ConnectorMarketEntry[] {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return entries
    return entries.filter((entry) =>
        entry.label.toLowerCase().includes(normalized)
        || entry.id.toLowerCase().includes(normalized)
        || (entry.version ?? '').toLowerCase().includes(normalized),
    )
}

export function summarizeConnectorMarket(entries: ConnectorMarketEntry[]) {
    const available = entries.filter((entry) => entry.available).length
    const verified = entries.filter((entry) => entry.integrityStatus === 'verified').length
    const mismatch = entries.filter((entry) => entry.integrityStatus === 'mismatch').length
    const upgrades = entries.filter((entry) => isConnectorUpgradeAvailable(entry)).length
    return {
        total: entries.length,
        available,
        pending: entries.length - available,
        verified,
        mismatch,
        upgrades,
    }
}

export function countConnectorUpdatesAvailable(entries: ConnectorMarketEntry[]): number {
    return entries.filter((entry) => isConnectorUpgradeAvailable(entry)).length
}

export const CONNECTOR_PLUGIN_DIR = 'config/plugins'

export function buildConnectorInstallGuide(entry: ConnectorMarketEntry): string {
    const lines = [
        `# ${entry.label} (${entry.id})`,
        `1. Build or obtain the connector plugin JAR for "${entry.id}".`,
    ]
    if (entry.jarName) {
        lines.push(`2. Place it as ${CONNECTOR_PLUGIN_DIR}/${entry.jarName}`)
    } else {
        lines.push(`2. Copy the JAR into ${CONNECTOR_PLUGIN_DIR}/`)
    }
    lines.push(
        '3. Optionally add/update an entry in config/plugins/manifest.json (version + sha256).',
        '4. Click Reload plugins in the marketplace (or POST /api/datasources/plugins/reload). Restart only if hot-reload fails (e.g. Windows file lock on an already-loaded JAR).',
        '5. Refresh this marketplace page.',
    )
    if (entry.version) {
        lines.push('', `Manifest version: ${entry.version}`)
    }
    if (entry.downloadUrl) {
        lines.push(`Download URL: ${entry.downloadUrl}`)
        lines.push('Admins can also use one-click Install from marketplace (downloads into config/plugins/).')
    }
    if (entry.installHint) {
        lines.push('', entry.installHint)
    }
    return lines.join('\n')
}

export function canRemoteInstallConnector(
    entry: ConnectorMarketEntry,
    isAdmin: boolean,
): boolean {
    return Boolean(isAdmin && !entry.available && entry.downloadUrl?.trim())
}

/** Re-download from downloadUrl when already loaded (upgrade / repair). */
export function canRemoteReinstallConnector(
    entry: ConnectorMarketEntry,
    isAdmin: boolean,
): boolean {
    return Boolean(isAdmin && entry.available && entry.downloadUrl?.trim())
}

export function canUninstallConnector(
    entry: ConnectorMarketEntry,
    isAdmin: boolean,
): boolean {
    // Admins can remove on-disk plugin JARs. Pure classpath "bundled" connectors have no
    // removable JAR (manifest may still list a jar name) — hide uninstall unless redundant on disk.
    if (!isAdmin || !entry.jarName?.trim()) return false
    if (entry.integrityStatus === 'bundled' && !entry.redundantOnDisk) return false
    return true
}

/** Prefer “clean redundant” wording when classpath still provides the connector. */
export function isRedundantPluginJar(entry: ConnectorMarketEntry): boolean {
    return Boolean(entry.redundantOnDisk || (entry.integrityStatus === 'bundled' && entry.jarName?.trim()))
}

/**
 * Manifest SHA no longer matches the installed JAR (or similar integrity drift) and a remote
 * download URL is published — admins can reinstall to upgrade.
 */
export function isConnectorUpgradeAvailable(entry: ConnectorMarketEntry): boolean {
    return Boolean(
        entry.available
        && entry.downloadUrl?.trim()
        && entry.integrityStatus === 'mismatch',
    )
}

export function formatConnectorIntegrityLabel(
    status: string | null | undefined,
    t: (key: string) => string,
    te: (key: string) => boolean,
): string | null {
    if (!status || status === 'none' || status === 'bundled') {
        if (status === 'bundled') {
            const key = 'plugin.connectorMarket.integrity.bundled'
            return te(key) ? t(key) : 'Bundled'
        }
        return null
    }
    const key = `plugin.connectorMarket.integrity.${status}`
    return te(key) ? t(key) : status
}

export function formatConnectorCapabilityLabel(
    capability: string,
    t: (key: string) => string,
    te: (key: string) => boolean,
): string {
    const key = `plugin.connectorMarket.capabilities.${capability}`
    return te(key) ? t(key) : capability.split('_').join(' ').toLowerCase()
}
