/** YARN applications / nodes / queues API DTOs. */
export type {YarnMutationResult} from './explorer-ops.types'

export interface YarnClusterInfo {
    id: string | null
    state: string | null
    haState: string | null
    resourceManagerVersion: string | null
    hadoopVersion: string | null
}

export interface YarnAppSummary {
    id: string | null
    name: string | null
    user: string | null
    queue: string | null
    state: string | null
    finalStatus: string | null
    applicationType: string | null
    progress: number
    startedTime: number
    finishedTime: number
    elapsedTime: number
    allocatedMb: number
    allocatedVCores: number
    runningContainers: number
    trackingUrl: string | null
}

export interface YarnAppDetail extends YarnAppSummary {
    amHostHttpAddress: string | null
    diagnostics: string | null
}

export interface YarnAppsResult {
    apps: YarnAppSummary[]
    totalCount: number
}

export interface YarnNodeSummary {
    id: string | null
    state: string | null
    nodeHealthStatus: string | null
    lastHealthUpdate: number
    numContainers: number
    usedMemoryMb: number
    availMemoryMb: number
    usedVirtualCores: number
    availableVirtualCores: number
}

export interface YarnNodesResult {
    nodes: YarnNodeSummary[]
    totalCount: number
}

export interface YarnQueueSummary {
    name: string | null
    state: string | null
    capacity: number
    usedCapacity: number
    numApplications: number
}

export interface YarnQueuesResult {
    queues: YarnQueueSummary[]
    schedulerType: string | null
}
