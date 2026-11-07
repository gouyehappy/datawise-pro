import type {DatasourcesApi, JdbcDriverResolveRequest} from '@/shared/api/types'
import type {
    ConnectorMarketEntry,
    DatasourceDefinition,
    InstallConnectorBatchResult,
    InstallConnectorPluginResult,
    JdbcDriverCached,
    JdbcDriverCatalog,
    JdbcDriverFamily,
    JdbcDriverResolveResult,
    JdbcDriverDownloadProgress,
    UninstallConnectorPluginResult,
} from '@/shared/api/datasource.types'
import type {
    JdbcDriverCachedDto,
    JdbcDriverCatalogDto,
    JdbcDriverFamilyDto,
    JdbcDriverResolveRequest as WireJdbcDriverResolveRequest,
    JdbcDriverResolveResultDto,
} from '@/shared/api/generated'
import {deleteJson, getJson, postJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

type DatasourcesListResponse = {
    datasources: DatasourceDefinition[]
    loadedPluginJars?: string[]
    pluginLoadFailures?: Array<{jarName: string; reason: string}>
}

type ConnectorMarketResponse = {
    connectors: ConnectorMarketEntry[]
    loadedPluginJars?: string[]
    pluginLoadFailures?: Array<{jarName: string; reason: string}>
    manifest?: {
        schemaVersion: number
        updatedAt?: string
        channel?: string
        pluginCount: number
    } | null
}

function mapCachedDriver(wire: JdbcDriverCachedDto): JdbcDriverCached {
    return {
        fileName: String(wire.fileName ?? ''),
        relativePath: String(wire.relativePath ?? ''),
        sizeBytes: Number(wire.sizeBytes ?? 0),
        loadedInMemory: Boolean(wire.loadedInMemory),
    }
}

function mapDriverFamily(wire: JdbcDriverFamilyDto): JdbcDriverFamily {
    return {
        id: String(wire.id ?? ''),
        label: String(wire.label ?? ''),
        defaultMaven: String(wire.defaultMaven ?? ''),
        driverClass: String(wire.driverClass ?? ''),
        relatedDbTypes: [...(wire.relatedDbTypes ?? [])],
        status: String(wire.status ?? ''),
        bundle: Boolean(wire.bundle),
        bundleDir: wire.bundleDir ?? null,
        jarCount: Number(wire.jarCount ?? 0),
        sizeBytes: Number(wire.sizeBytes ?? 0),
        jars: (wire.jars ?? []).map(mapCachedDriver),
    }
}

function mapDriverCatalog(wire: JdbcDriverCatalogDto): JdbcDriverCatalog {
    return {
        families: (wire.families ?? []).map(mapDriverFamily),
        orphans: (wire.orphans ?? []).map(mapCachedDriver),
        drivers: (wire.drivers ?? []).map(mapCachedDriver),
        totalBytes: Number(wire.totalBytes ?? 0),
        driversDirectory: String(wire.driversDirectory ?? ''),
    }
}

function mapResolveResult(wire: JdbcDriverResolveResultDto): JdbcDriverResolveResult {
    return {
        mavenCoordinates: String(wire.mavenCoordinates ?? ''),
        driverClass: String(wire.driverClass ?? ''),
        localPath: String(wire.localPath ?? ''),
        downloaded: Boolean(wire.downloaded),
        cached: Boolean(wire.cached),
    }
}

function toWireResolveRequest(request: JdbcDriverResolveRequest): WireJdbcDriverResolveRequest {
    return {
        mavenCoordinates: request.mavenCoordinates,
        driverClass: request.driverClass,
    }
}

export function createHttpDatasourcesApi(): DatasourcesApi {
    return {
        list: async () => {
            return getJson<DatasourcesListResponse>(API_PATHS.datasources.list)
        },

        market: async () => {
            return getJson<ConnectorMarketResponse>(API_PATHS.datasources.market)
        },

        fetchExplorerUiCatalog: async () =>
            getJson<import('@/shared/api/explorer-ui-catalog.types').ConnectorExplorerUiCatalog>(
                API_PATHS.datasources.explorerUi,
            ),

        resolveDriver: async (request) =>
            mapResolveResult(
                await postJson<JdbcDriverResolveResultDto>(
                    API_PATHS.datasources.resolveDriver,
                    toWireResolveRequest(request),
                    {silent: true},
                ),
            ),

        installDriver: async (request) =>
            mapResolveResult(
                await postJson<JdbcDriverResolveResultDto>(
                    API_PATHS.datasources.driversInstall,
                    toWireResolveRequest(request),
                    {silent: true},
                ),
            ),

        driverProgress: async (mavenCoordinates) =>
            getJson<JdbcDriverDownloadProgress>(
                API_PATHS.datasources.driversProgress(mavenCoordinates),
                undefined,
                {silent: true},
            ),

        listDrivers: async () =>
            mapDriverCatalog(await getJson<JdbcDriverCatalogDto>(API_PATHS.datasources.drivers)),

        deleteDriver: async (relativePath) =>
            deleteJson<{deleted: boolean; relativePath: string}>(
                API_PATHS.datasources.deleteDriver(relativePath),
            ),

        deleteDriverBundle: async (bundleDir) =>
            deleteJson<{deletedCount: number; bundleDir: string}>(
                API_PATHS.datasources.deleteDriverBundle(bundleDir),
            ),

        deleteDriverFamily: async (familyId) =>
            deleteJson<{deletedCount: number; familyId: string}>(
                API_PATHS.datasources.deleteDriverFamily(familyId),
            ),

        installFromMarket: async (connectorId) =>
            postJson<InstallConnectorPluginResult>(
                API_PATHS.datasources.marketInstall,
                {connectorId},
                {timeoutMs: 120_000},
            ),

        installFromMarketBatch: async (connectorIds) =>
            postJson<InstallConnectorBatchResult>(
                API_PATHS.datasources.marketInstallBatch,
                {connectorIds},
                {timeoutMs: 180_000},
            ),

        uninstallFromMarket: async (connectorId) =>
            deleteJson<UninstallConnectorPluginResult>(
                API_PATHS.datasources.marketUninstall(connectorId),
            ),

        cleanupRedundantPlugins: async () =>
            postJson<{
                deletedCount: number
                deletedJars: string[]
                failedJars: string[]
                message: string
            }>(API_PATHS.datasources.marketCleanupRedundant, {}),

        pluginLoadStatus: async () =>
            getJson<{
                phase: string
                ready: boolean
                loadedJarCount: number
                loadedConnectorCount: number
                failureCount: number
            }>(API_PATHS.datasources.pluginsStatus),

        reloadPlugins: async () =>
            postJson<{
                loadedJarCount: number
                loadedConnectorIds: string[]
                failures: Array<{jarName: string; reason: string}>
            }>(API_PATHS.datasources.pluginsReload, {}),

        clearQuarantinedPlugins: async () =>
            postJson<{
                loadedJarCount: number
                loadedConnectorIds: string[]
                failures: Array<{jarName: string; reason: string}>
            }>(API_PATHS.datasources.pluginsQuarantineClear, {}),
    }
}
