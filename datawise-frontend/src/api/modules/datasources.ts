import {api} from '@/shared/api'
import type {
    ConnectorMarketEntry,
    ConnectorMarketManifestSummary,
    InstallConnectorBatchResult,
    InstallConnectorPluginResult,
    JdbcDriverCatalog,
    JdbcDriverResolveResult,
    RuntimeOverview,
    UninstallConnectorPluginResult,
} from '@/features/datasource/types/datasource.types'

export const datasourcesApi = {
    list: () => api.datasources.list(),
    market: (): Promise<{
        connectors: ConnectorMarketEntry[]
        loadedPluginJars?: string[]
        pluginLoadFailures?: Array<{jarName: string; reason: string}>
        manifest?: ConnectorMarketManifestSummary | null
    }> => api.datasources.market(),
    fetchExplorerUiCatalog: () => api.datasources.fetchExplorerUiCatalog(),
    resolveDriver: (mavenCoordinates: string, driverClass: string): Promise<JdbcDriverResolveResult> =>
        api.datasources.resolveDriver({mavenCoordinates, driverClass}),
    installDriver: (mavenCoordinates: string, driverClass: string): Promise<JdbcDriverResolveResult> =>
        api.datasources.installDriver({mavenCoordinates, driverClass}),
    driverProgress: (mavenCoordinates: string) =>
        api.datasources.driverProgress(mavenCoordinates),
    listDrivers: (): Promise<JdbcDriverCatalog> => api.datasources.listDrivers(),
    deleteDriver: (relativePath: string) => api.datasources.deleteDriver(relativePath),
    deleteDriverBundle: (bundleDir: string) => api.datasources.deleteDriverBundle(bundleDir),
    deleteDriverFamily: (familyId: string) => api.datasources.deleteDriverFamily(familyId),
    installFromMarket: (connectorId: string): Promise<InstallConnectorPluginResult> =>
        api.datasources.installFromMarket(connectorId),
    installFromMarketBatch: (connectorIds: string[]): Promise<InstallConnectorBatchResult> =>
        api.datasources.installFromMarketBatch(connectorIds),
    uninstallFromMarket: (connectorId: string): Promise<UninstallConnectorPluginResult> =>
        api.datasources.uninstallFromMarket(connectorId),
    cleanupRedundantPlugins: () => api.datasources.cleanupRedundantPlugins(),
    pluginLoadStatus: () => api.datasources.pluginLoadStatus(),
    reloadPlugins: () => api.datasources.reloadPlugins(),
    clearQuarantinedPlugins: () => api.datasources.clearQuarantinedPlugins(),
}

export const runtimeApi = {
    overview: (): Promise<RuntimeOverview> => api.runtime.overview(),
    jre: () => api.runtime.jre(),
    importOffline: (path: string) => api.runtime.importOffline(path),
}
