export type IndexInfo = {
  name: string
  health?: string
  status?: string
  docsCount?: string
  storeSize?: string
  kind?: string
}

export type HistBucket = {
  keyAsString?: string
  key?: number | string
  docCount: number
}

export type SearchHit = {
  index: string
  id: string
  score?: unknown
  timestamp?: string
  message?: string
  level?: string
  source: Record<string, unknown> | string
}

export type SearchResult = {
  took?: number
  timedOut?: boolean
  total?: number | { value?: number; relation?: string }
  hits: SearchHit[]
  indexPattern?: string
  histogram?: HistBucket[]
  fields?: string[]
  timeField?: string
  fromTime?: string
  toTime?: string
}

export type HostContext = {
  connectionId?: string
  connectionName?: string
  connection?: {
    id?: string
    name?: string
    config?: Record<string, unknown>
  }
  [key: string]: unknown
}
