export const QUERY_LIBRARY_MANIFEST_VERSION = 1

export interface QueryLibraryCiConfig {
    enabled?: boolean
    maxRows?: number
    expectMinRows?: number
    expectMaxRows?: number
}

export interface QueryLibraryManifestQuery {
    id: string
    name: string
    file: string
    connection: string
    connectionName?: string
    database?: string
    tags?: string[]
    ci?: QueryLibraryCiConfig
}

export interface QueryLibraryManifest {
    version: number
    queries: QueryLibraryManifestQuery[]
}

export interface QueryLibraryValidationIssue {
    path: string
    message: string
    level: 'error' | 'warning'
}

export interface QueryLibraryRunResult {
    id: string
    name: string
    status: 'success' | 'failed' | 'skipped'
    rowCount?: number
    durationMs?: number
    message?: string
}
