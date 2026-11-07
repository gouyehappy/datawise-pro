/** Jenkins jobs / nodes / queue API DTOs. */
export interface JenkinsInfo {
    nodeName: string | null
    nodeDescription: string | null
    mode: string | null
    version: string | null
    numExecutors: number
    useCrumbs: boolean
    url: string | null
}

export interface JenkinsViewSummary {
    name: string | null
    url: string | null
}

export interface JenkinsViewsResult {
    views: JenkinsViewSummary[]
    totalCount: number
}

export interface JenkinsJobSummary {
    name: string | null
    fullName: string | null
    url: string | null
    color: string | null
    jobClass: string | null
    buildable: boolean
    folder?: boolean
    lastBuildNumber?: number | null
    lastBuildResult?: string | null
    lastBuildBuilding?: boolean
    lastBuildTimestamp?: number
    lastBuildDuration?: number
    lastSuccessTimestamp?: number
    lastFailureTimestamp?: number
}

export interface JenkinsJobsResult {
    jobs: JenkinsJobSummary[]
    totalCount: number
}

export interface JenkinsBuildSummary {
    number: number
    url: string | null
    result: string | null
    building: boolean
    timestamp: number
    duration: number
    displayName: string | null
}

export interface JenkinsJobParameter {
    name: string | null
    type: string | null
    description: string | null
    defaultValue: string | null
    choices: string[]
}

export interface JenkinsJobDetail {
    name: string | null
    fullName: string | null
    url: string | null
    color: string | null
    description: string | null
    buildable: boolean
    inQueue: boolean
    lastBuild: JenkinsBuildSummary | null
    lastCompletedBuild: JenkinsBuildSummary | null
    lastSuccessfulBuild: JenkinsBuildSummary | null
    lastFailedBuild: JenkinsBuildSummary | null
    builds: JenkinsBuildSummary[]
    parameterDefinitions: JenkinsJobParameter[]
}

export interface JenkinsMutationResult {
    success: boolean
    message: string | null
    queueUrl: string | null
}

export interface JenkinsBuildLog {
    text: string | null
    moreData: boolean
    nextStart: number
}

export interface JenkinsQueueItem {
    id: number
    taskName: string | null
    taskUrl: string | null
    why: string | null
    blocked: boolean
    buildable: boolean
    inQueueSince: number
}

export interface JenkinsQueueResult {
    items: JenkinsQueueItem[]
    totalCount: number
}

export interface JenkinsNodeSummary {
    displayName: string | null
    description: string | null
    offline: boolean
    temporarilyOffline: boolean
    idle: boolean
    numExecutors: number
    busyExecutors: number
    offlineCauseReason: string | null
    assignedLabels: string | null
}

export interface JenkinsNodesResult {
    nodes: JenkinsNodeSummary[]
    totalCount: number
}
