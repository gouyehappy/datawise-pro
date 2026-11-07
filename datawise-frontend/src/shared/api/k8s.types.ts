/** Kubernetes API DTOs (ExplorerApi / K8s workbenches). */
export interface K8sClusterInfo {
    gitVersion: string | null
    platform: string | null
    major: string | null
    minor: string | null
}

export interface K8sNamespaceSummary {
    name: string | null
    status: string | null
    creationTimestamp: string | null
}

export interface K8sNamespacesResult {
    namespaces: K8sNamespaceSummary[]
    totalCount: number
}

export interface K8sPodSummary {
    name: string | null
    namespace: string | null
    phase: string | null
    nodeName: string | null
    podIp: string | null
    restartCount: number
    ready: string | null
    creationTimestamp: string | null
}

export interface K8sPodsResult {
    pods: K8sPodSummary[]
    totalCount: number
}

export interface K8sContainerSummary {
    name: string | null
    image: string | null
    ready: boolean
    restartCount: number
    state: string | null
}

export interface K8sPodDetail extends K8sPodSummary {
    hostIp: string | null
    reason: string | null
    message: string | null
    labels: Record<string, string>
    containers: K8sContainerSummary[]
}

export interface K8sDeploymentSummary {
    name: string | null
    namespace: string | null
    replicas: number
    readyReplicas: number
    availableReplicas: number
    updatedReplicas: number
    creationTimestamp: string | null
}

export interface K8sDeploymentsResult {
    deployments: K8sDeploymentSummary[]
    totalCount: number
}

export interface K8sServiceSummary {
    name: string | null
    namespace: string | null
    type: string | null
    clusterIp: string | null
    ports: string | null
    creationTimestamp: string | null
}

export interface K8sServicesResult {
    services: K8sServiceSummary[]
    totalCount: number
}

export interface K8sConfigMapSummary {
    name: string | null
    namespace: string | null
    keys: string[]
    dataCount: number
    creationTimestamp: string | null
}

export interface K8sConfigMapsResult {
    configMaps: K8sConfigMapSummary[]
    totalCount: number
}

export interface K8sSecretSummary {
    name: string | null
    namespace: string | null
    type: string | null
    keys: string[]
    dataCount: number
    creationTimestamp: string | null
}

export interface K8sSecretsResult {
    secrets: K8sSecretSummary[]
    totalCount: number
}

export interface K8sEventSummary {
    type: string | null
    reason: string | null
    message: string | null
    involvedKind: string | null
    involvedName: string | null
    count: number
    lastTimestamp: string | null
}

export interface K8sEventsResult {
    events: K8sEventSummary[]
    totalCount: number
}

export interface K8sCrdSummary {
    name: string | null
    group: string | null
    version: string | null
    kind: string | null
    scope: string | null
    creationTimestamp: string | null
}

export interface K8sCrdsResult {
    crds: K8sCrdSummary[]
    totalCount: number
}

export interface K8sHelmReleaseSummary {
    name: string | null
    namespace: string | null
    status: string | null
    chart: string | null
    appVersion: string | null
    revision: number
    updated: string | null
}

export interface K8sHelmReleasesResult {
    releases: K8sHelmReleaseSummary[]
    totalCount: number
}

export interface K8sAppliedResource {
    apiVersion: string | null
    kind: string | null
    namespace: string | null
    name: string | null
    action: string | null
    success: boolean
    message: string | null
}

export interface K8sApplyResult {
    success: boolean
    message: string | null
    resources: K8sAppliedResource[]
}

export interface K8sLogs {
    namespace: string | null
    pod: string | null
    container: string | null
    content: string | null
}

export interface K8sMutationResult {
    success: boolean
    message: string | null
    state: string | null
}
