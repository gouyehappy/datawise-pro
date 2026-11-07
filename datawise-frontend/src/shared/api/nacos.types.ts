/** Nacos config / namespace / service API DTOs. */
export interface NacosInfo {
    version: string | null
    serverStatus: string | null
    url: string | null
}

export interface NacosNamespaceSummary {
    namespace: string | null
    namespaceShowName: string | null
    quota?: number
    configCount?: number
    type?: number
}

export interface NacosNamespacesResult {
    namespaces: NacosNamespaceSummary[]
    totalCount: number
}

export interface NacosConfigSummary {
    dataId: string | null
    group: string | null
    type: string | null
    appName: string | null
    namespaceId?: string | null
}

export interface NacosConfigsResult {
    configs: NacosConfigSummary[]
    totalCount: number
}

export interface NacosConfigDetail {
    dataId: string | null
    group: string | null
    type: string | null
    appName: string | null
    content: string | null
    namespaceId?: string | null
}

export interface NacosServiceSummary {
    name: string | null
    groupName: string | null
    clusterCount?: string | null
}

export interface NacosServicesResult {
    services: NacosServiceSummary[]
    totalCount: number
}

export interface NacosInstanceSummary {
    ip: string | null
    port: number
    healthy: boolean
    weight: number
    clusterName?: string | null
    serviceName?: string | null
    enabled?: boolean
    metadata?: string | null
}

export interface NacosInstancesResult {
    instances: NacosInstanceSummary[]
    totalCount: number
}
