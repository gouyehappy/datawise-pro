export interface DatasourceDefinition {
    id: string
    label: string
    primary: boolean
    defaultPort: string
    jdbcDriverRequired: boolean
    defaultDriverMaven?: string
    defaultDriverClass?: string
    capabilities: string[]
    /** 与后端 DbType.getQuote() 一致 */
    identifierQuote?: string
}

export interface JdbcDriverDownloadProgress {
    mavenCoordinates: string
    downloadedBytes: number
    totalBytes: number
    active: boolean
    completed: boolean
    cached: boolean
    error?: string | null
}

export interface JdbcDriverResolveResult {
    mavenCoordinates: string
    driverClass: string
    localPath: string
    downloaded: boolean
    cached: boolean
}

export interface ConnectorPluginLoadFailure {
    jarName: string
    reason: string
}

export interface DatasourceCatalogBundle {
    datasources: DatasourceDefinition[]
    loadedPluginJars: string[]
    pluginLoadFailures: ConnectorPluginLoadFailure[]
}

export interface ConnectorMarketEntry {
    id: string
    label: string
    primary: boolean
    available: boolean
    capabilities: string[]
    installHint?: string | null
    version?: string | null
    jarName?: string | null
    /** bundled | verified | mismatch | unsigned | missing | none */
    integrityStatus?: string | null
    downloadUrl?: string | null
    /** Disk JAR exists but live connector comes from classpath. */
    redundantOnDisk?: boolean
    /** Commercial pack id when paid; absent for Standard free connectors. */
    packId?: string | null
    /** True when entitlement mode is enforced and the pack is locked. */
    entitlementLocked?: boolean
}

export interface ConnectorMarketManifestSummary {
    schemaVersion: number
    updatedAt?: string
    channel?: string
    pluginCount: number
}

export interface ConnectorMarketBundle {
    connectors: ConnectorMarketEntry[]
    loadedPluginJars: string[]
    pluginLoadFailures: ConnectorPluginLoadFailure[]
    manifest?: ConnectorMarketManifestSummary | null
}

export interface JdbcDriverCached {
    fileName: string
    relativePath: string
    sizeBytes: number
    loadedInMemory: boolean
}

/** Product-managed JDBC driver family (catalog + local cache). */
export interface JdbcDriverFamily {
    id: string
    label: string
    defaultMaven: string
    driverClass: string
    relatedDbTypes: string[]
    /** missing | installed | loaded */
    status: string
    bundle: boolean
    bundleDir?: string | null
    jarCount: number
    sizeBytes: number
    jars: JdbcDriverCached[]
    /** core | on-demand | sidecar — how the family is meant to arrive on disk */
    delivery?: 'core' | 'on-demand' | 'sidecar' | string
}

export interface RuntimeOfflineImportResult {
    pluginJars: string[]
    driverJars: string[]
    catalogOverlay: boolean
    reload: {
        loadedJarCount: number
        loadedConnectorIds: string[]
        failures: Array<{jarName: string; reason: string}>
    }
    message: string
}

export interface JdbcDriverCatalog {
    families: JdbcDriverFamily[]
    orphans: JdbcDriverCached[]
    drivers: JdbcDriverCached[]
    totalBytes: number
    driversDirectory: string
}

export interface InstallConnectorPluginResult {
    connectorId: string
    jarName: string | null
    integrityStatus: string
    restartRequired: boolean
    message: string
}

export interface InstallConnectorBatchResult {
    results: InstallConnectorPluginResult[]
    reload: {
        loadedJarCount: number
        loadedConnectorIds: string[]
        failures: Array<{jarName: string; reason: string}>
    }
}

export interface UninstallConnectorPluginResult {
    connectorId: string
    jarName: string
    deleted: boolean
    restartRequired: boolean
    message: string
}

export interface RuntimeOverview {
    jre: {
        version: string
        vendor: string
        home: string
        source: string
    }
    connectors: {
        installed: number
        catalogTotal: number
        pluginsBytes: number
        failures: ConnectorPluginLoadFailure[]
    }
    drivers: {
        cachedJars: number
        totalBytes: number
    }
    workspace: {
        configDir: string
        diskUsageBytes: number
    }
    packaging: {
        profile: string
        connectors: string
        drivers: string
    }
}
