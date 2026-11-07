export interface JobSummary {
  name: string
  fullName: string
  url?: string | null
  color?: string | null
  className?: string | null
  buildable?: boolean
  folder?: boolean
  lastBuildNumber?: number
  lastBuildResult?: string | null
  lastBuildBuilding?: boolean
  lastBuildTimestamp?: number
  lastBuildDuration?: number
  lastSuccessNumber?: number
  lastSuccessTimestamp?: number
  lastFailureNumber?: number
  lastFailureTimestamp?: number
}

export interface JobParameter {
  name: string
  type?: string | null
  description?: string | null
  defaultValue?: string
  choices?: string[]
  className?: string | null
}

export interface BuildSummary {
  number: number
  url?: string
  result?: string | null
  building?: boolean
  timestamp?: number
  duration?: number
  displayName?: string
}

export interface ArtifactInfo {
  fileName: string
  relativePath: string
  displayPath?: string | null
  /** Bytes when known (HEAD / download). */
  sizeBytes?: number | null
}

export interface NodeInfo {
  displayName: string
  description?: string | null
  offline: boolean
  temporarilyOffline: boolean
  idle: boolean
  numExecutors: number
  busyExecutors: number
  offlineCauseReason?: string | null
  labels: string[]
}

export interface QueueItem {
  id: number
  blocked: boolean
  buildable: boolean
  inQueueSince: number
  why?: string | null
  taskName?: string | null
  taskUrl?: string | null
}

export interface ViewInfo {
  name: string
  url?: string | null
  description?: string | null
}

export interface Overview {
  baseUrl: string
  readOnly: boolean
  downloadDir?: string
  version?: string
  nodeName?: string
  mode?: string
  numExecutors?: number
  quietingDown?: boolean
  queueCount: number
  offlineNodes: number
  busyExecutors: number
  totalExecutors: number
  queue: QueueItem[]
  building: JobSummary[]
  failing: JobSummary[]
  /** Optional pin resolutions when overview is called with `pins`. */
  pinned?: JobSummary[]
}

export type NavId = 'overview' | 'jobs' | 'queue' | 'nodes'
