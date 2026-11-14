import type {
    ApiResponse,
    CliConfig,
    ExecuteSqlRequest,
    ExecuteSqlResult,
    MigrationBatchReport,
    SqlVisibleConnection,
    TableMigrationBatchRequest,
} from './types.js'

export class DatawiseApiError extends Error {
    readonly status: number
    readonly errorCode?: string

    constructor(status: number, message: string, errorCode?: string) {
        super(message)
        this.name = 'DatawiseApiError'
        this.status = status
        this.errorCode = errorCode
    }
}

export class DatawiseClient {
    constructor(private readonly config: CliConfig) {
    }

    async migrateBatch(request: TableMigrationBatchRequest): Promise<MigrationBatchReport> {
        return this.postJson<MigrationBatchReport>('/api/migration/batch', request)
    }

    async executeSql(request: ExecuteSqlRequest): Promise<ExecuteSqlResult> {
        return this.postJson<ExecuteSqlResult>('/api/sql/execute', request)
    }

    /** Owned + team-shared connections visible to the API token user (desktop semantics). */
    async listSqlConnections(): Promise<SqlVisibleConnection[]> {
        return this.getJson('/api/sql/connections')
    }

    async listSchemaTables(
        connectionId: string,
        database?: string,
    ): Promise<{database?: string; tables: Array<{tableName?: string; name?: string}>}> {
        const qs = new URLSearchParams({connectionId})
        if (database) qs.set('database', database)
        return this.getJson(`/api/schema/tables?${qs.toString()}`)
    }

    async fetchTableProperties(
        connectionId: string,
        database: string | undefined,
        tableName: string,
    ): Promise<{
        tableName?: string
        columns?: Array<{
            name?: string
            type?: string
            dataType?: string
            nullable?: boolean
            keyType?: string
            primaryKey?: boolean
            comment?: string
        }>
    }> {
        const qs = new URLSearchParams({connectionId})
        if (database) qs.set('database', database)
        return this.getJson(`/api/tables/${encodeURIComponent(tableName)}/properties?${qs.toString()}`)
    }

    async getConfigMigrationStatus(): Promise<import('./types.js').LegacyConfigMigrationStatus> {
        return this.getJson('/api/system/config-migration')
    }

    async applyConfigMigration(): Promise<import('./types.js').LegacyConfigMigrationStatus> {
        return this.postJson('/api/system/config-migration/apply', {})
    }

    async runtimeOverview(): Promise<RuntimeOverview> {
        return this.getJson('/api/runtime')
    }

    async listConnectorMarket(): Promise<ConnectorMarketResponse> {
        return this.getJson('/api/datasources/market')
    }

    async listDrivers(): Promise<JdbcDriverCatalog> {
        return this.getJson('/api/datasources/drivers')
    }

    async installConnector(connectorId: string): Promise<InstallConnectorResult> {
        return this.postJson('/api/datasources/market/install', {connectorId})
    }

    async installConnectorsBatch(connectorIds: string[]): Promise<InstallConnectorBatchResult> {
        return this.postJson('/api/datasources/market/install-batch', {connectorIds})
    }

    async uninstallConnector(connectorId: string): Promise<UninstallConnectorResult> {
        return this.deleteJson(`/api/datasources/market/${encodeURIComponent(connectorId)}`)
    }

    async listProjects(includeArchived = false): Promise<ProjectDto[]> {
        const qs = includeArchived ? '?includeArchived=true' : ''
        return this.getJson(`/api/projects${qs}`)
    }

    async getActiveProject(): Promise<ActiveProjectDto> {
        return this.getJson('/api/projects/active')
    }

    async setActiveProject(projectId: string): Promise<ActiveProjectDto> {
        return this.requestJson('PUT', '/api/projects/active', {projectId})
    }

    async createProject(body: {
        name: string
        colorKey?: string
        description?: string
    }): Promise<ProjectDto> {
        return this.postJson('/api/projects', body)
    }

    async installDriver(mavenCoordinates: string, driverClass: string): Promise<JdbcDriverResolveResult> {
        return this.postJson('/api/datasources/drivers/install', {mavenCoordinates, driverClass})
    }

    async importRuntimeOffline(zipPath: string): Promise<RuntimeOfflineImportResult> {
        return this.postJson('/api/runtime/import', {path: zipPath})
    }

    private async getJson<T>(path: string): Promise<T> {
        return this.requestJson<T>('GET', path)
    }

    private async postJson<T>(path: string, body: unknown): Promise<T> {
        return this.requestJson<T>('POST', path, body)
    }

    private async deleteJson<T>(path: string): Promise<T> {
        return this.requestJson<T>('DELETE', path)
    }

    private async requestJson<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
        const url = `${this.config.server}${path}`
        const headers: Record<string, string> = {
            'X-DW-Api-Token': this.config.token,
        }
        if (method === 'POST' || method === 'PUT') {
            headers['Content-Type'] = 'application/json'
        }
        const response = await fetch(url, {
            method,
            headers,
            body: method === 'POST' || method === 'PUT' ? JSON.stringify(body ?? {}) : undefined,
            signal: AbortSignal.timeout(30_000),
        })

        let payload: ApiResponse<T> | null = null
        try {
            payload = await response.json() as ApiResponse<T>
        } catch {
            throw new DatawiseApiError(response.status, `Invalid JSON response from ${url}`)
        }

        if (!response.ok || payload.code !== 0) {
            const message = payload.msg?.trim() || `Request failed (${response.status})`
            const errorCode = readErrorCode(payload.data)
            throw new DatawiseApiError(response.status, message, errorCode)
        }
        if (payload.data == null) {
            throw new DatawiseApiError(response.status, payload.msg?.trim() || 'Empty response data')
        }
        return payload.data
    }
}

function readErrorCode(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') return undefined
    const code = (data as {errorCode?: unknown}).errorCode
    return typeof code === 'string' && code.trim() ? code.trim() : undefined
}

export interface RuntimeOverview {
    jre: {version: string; vendor: string; home: string; source: string}
    connectors: {installed: number; catalogTotal: number; pluginsBytes: number; failures: unknown[]}
    drivers: {cachedJars: number; totalBytes: number}
    workspace: {configDir: string; diskUsageBytes: number}
}

export interface ConnectorMarketEntry {
    id: string
    label: string
    available: boolean
    downloadUrl?: string | null
}

export interface ConnectorMarketResponse {
    connectors: ConnectorMarketEntry[]
}

export interface JdbcDriverFamily {
    id: string
    label: string
    defaultMaven: string
    driverClass: string
    relatedDbTypes: string[]
    status: string
}

export interface JdbcDriverCatalog {
    families: JdbcDriverFamily[]
    drivers?: unknown[]
    totalBytes?: number
}

export interface InstallConnectorResult {
    connectorId: string
    jarName: string | null
    integrityStatus: string
    restartRequired: boolean
    message: string
}

export interface InstallConnectorBatchResult {
    results: InstallConnectorResult[]
    reload: unknown
}

export interface UninstallConnectorResult {
    connectorId: string
    jarName: string
    deleted: boolean
    restartRequired: boolean
    message: string
}

export interface ProjectDto {
    id: string
    name: string
    colorKey?: string | null
    description?: string | null
    archived: boolean
    isDefault: boolean
    docsDir?: string | null
    scriptsDir?: string | null
}

export interface ActiveProjectDto {
    projectId: string
    project: ProjectDto
}

export interface JdbcDriverResolveResult {
    mavenCoordinates: string
    driverClass: string
    localPath: string
    downloaded: boolean
    cached: boolean
}

export interface RuntimeOfflineImportResult {
    pluginJars: string[]
    driverJars: string[]
    catalogOverlay: boolean
    reload: unknown
    message: string
}
