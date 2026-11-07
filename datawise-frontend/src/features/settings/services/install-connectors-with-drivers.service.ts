import {datasourcesApi} from '@/api'
import type {
    InstallConnectorBatchResult,
    InstallConnectorPluginResult,
    JdbcDriverResolveResult,
} from '@/features/datasource/types/datasource.types'
import {CORE_CONNECTOR_IDS} from '@/features/settings/services/runtime-format.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'

export interface ConnectorDriverInstallProgress {
    phase: 'connectors' | 'drivers'
    connectorId?: string
    mavenCoordinates?: string
    index: number
    total: number
    message: string
}

export interface ConnectorDriverInstallOptions {
    /** When false, skip JDBC driver download after connectors. Default true. */
    withDrivers?: boolean
    onProgress?: (progress: ConnectorDriverInstallProgress) => void
}

export interface ConnectorDriverInstallResult {
    connectors: InstallConnectorBatchResult
    drivers: Array<{
        connectorId: string
        mavenCoordinates: string
        driverClass: string
        ok: boolean
        result?: JdbcDriverResolveResult
        error?: string
    }>
}

function uniqueIds(ids: string[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const id of ids) {
        const trimmed = id?.trim()
        if (!trimmed || seen.has(trimmed)) continue
        seen.add(trimmed)
        out.push(trimmed)
    }
    return out
}

/**
 * Install marketplace connectors (batch), then optionally download each connector's
 * default JDBC driver from the datasource catalog.
 */
export async function installConnectorsWithDrivers(
    connectorIds: string[],
    options: ConnectorDriverInstallOptions = {},
): Promise<ConnectorDriverInstallResult> {
    const ids = uniqueIds(connectorIds)
    if (!ids.length) {
        return {
            connectors: {
                results: [],
                reload: {loadedJarCount: 0, loadedConnectorIds: [], failures: []},
            },
            drivers: [],
        }
    }

    const withDrivers = options.withDrivers !== false
    options.onProgress?.({
        phase: 'connectors',
        index: 0,
        total: ids.length,
        message: `Installing ${ids.length} connector(s)…`,
    })

    const connectors = await datasourcesApi.installFromMarketBatch(ids)
    const failed = (connectors.results ?? []).filter((item) => !item.jarName)
    if (failed.length === ids.length) {
        const detail = failed.map((item) => item.message || item.connectorId).filter(Boolean).join('; ')
        throw new Error(
            detail || t('plugin.connectorMarket.installCoreFailed'),
        )
    }
    if (failed.length > 0) {
        const detail = failed.map((item) => `${item.connectorId}: ${item.message || 'failed'}`).join('; ')
        console.warn('[installConnectorsWithDrivers] partial failure:', detail)
    }

    if (!withDrivers) {
        return {connectors, drivers: []}
    }

    const catalog = await datasourcesApi.list()
    const byId = new Map(catalog.datasources.map((ds) => [ds.id, ds]))
    const driverCatalog = await datasourcesApi.listDrivers()
    const drivers: ConnectorDriverInstallResult['drivers'] = []
    let index = 0

    for (const connectorId of ids) {
        const ds = byId.get(connectorId)
        let maven = ds?.defaultDriverMaven?.trim()
        let driverClass = ds?.defaultDriverClass?.trim()
        if (!maven || !driverClass) {
            const family = (driverCatalog.families ?? []).find((f) =>
                (f.relatedDbTypes ?? []).includes(connectorId) && f.defaultMaven && f.driverClass,
            )
            maven = family?.defaultMaven?.trim()
            driverClass = family?.driverClass?.trim()
        }
        if (!maven || !driverClass) {
            continue
        }
        index += 1
        options.onProgress?.({
            phase: 'drivers',
            connectorId,
            mavenCoordinates: maven,
            index,
            total: ids.length,
            message: `Installing JDBC driver for ${connectorId}…`,
        })
        try {
            const result = await datasourcesApi.installDriver(maven, driverClass)
            drivers.push({
                connectorId,
                mavenCoordinates: maven,
                driverClass,
                ok: true,
                result,
            })
        } catch (err) {
            drivers.push({
                connectorId,
                mavenCoordinates: maven,
                driverClass,
                ok: false,
                error: resolveCaughtApiErrorMessage(err, t, 'plugin.connectorMarket.installCoreFailed'),
            })
        }
    }

    return {connectors, drivers}
}

/** Install missing core-tier connectors (and their drivers by default). */
export async function installCoreConnectorsWithDrivers(
    options: ConnectorDriverInstallOptions = {},
): Promise<ConnectorDriverInstallResult> {
    const market = await datasourcesApi.market()
    const pending = market.connectors
        .filter((entry) =>
            (CORE_CONNECTOR_IDS as readonly string[]).includes(entry.id)
            && !entry.available
            && entry.downloadUrl?.trim(),
        )
        .map((entry) => entry.id)
    return installConnectorsWithDrivers(pending, options)
}

export function countSuccessfulConnectorInstalls(
    results: InstallConnectorPluginResult[],
): number {
    return results.filter((item) => item.jarName).length
}
