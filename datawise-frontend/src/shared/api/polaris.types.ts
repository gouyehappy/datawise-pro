/** Polaris service / config API DTOs. */
export interface PolarisInfo {
    version: string | null
    serverStatus: string | null
    url: string | null
}

export interface PolarisNamespaceSummary {
    name: string | null
    comment?: string | null
}

export interface PolarisNamespacesResult {
    namespaces: PolarisNamespaceSummary[]
    totalCount: number
}

export interface PolarisServiceSummary {
    name: string | null
    namespace: string | null
    ports?: string | null
    metadata?: string | null
    instanceCount?: number
}

export interface PolarisServicesResult {
    services: PolarisServiceSummary[]
    totalCount: number
}

export interface PolarisInstanceSummary {
    host: string | null
    port: number
    healthy: boolean
    weight: number
    metadata?: string | null
}

export interface PolarisInstancesResult {
    instances: PolarisInstanceSummary[]
    totalCount: number
}

export interface PolarisConfigSummary {
    name: string | null
    namespace: string | null
    group: string | null
    format?: string | null
    comment?: string | null
}

export interface PolarisConfigsResult {
    configs: PolarisConfigSummary[]
    totalCount: number
}

export interface PolarisConfigDetail {
    name: string | null
    namespace: string | null
    group: string | null
    content: string | null
    format?: string | null
    md5?: string | null
}
