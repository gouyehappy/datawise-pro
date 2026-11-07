/** Elasticsearch REST / document API DTOs. */
export interface ElasticsearchIndexEntry {
    name: string
    aliases: string[]
}

export interface ElasticsearchIndicesResult {
    indices: ElasticsearchIndexEntry[]
}

export interface ElasticsearchIndexMetadata {
    index: string
    mappingJson: string
    settingsJson: string
    statsJson: string
}

export interface ElasticsearchRestColumn {
    name: string
    type: string
}

export interface ElasticsearchRestResult {
    method: string
    path: string
    status: number
    risk: string
    rawBody: string
    tabular: boolean
    columns: ElasticsearchRestColumn[]
    rows: Record<string, unknown>[]
    durationMs: number
    error: string | null
}

export interface ElasticsearchClearIndexResult {
    index: string
    deleted: number
    total?: number
    versionConflicts?: number
    timedOut: boolean
    failures?: string[]
    rawBody: string
}

export interface ElasticsearchDocument {
    id: string
    index: string
    routing: string | null
    sourceJson: string
}

export interface ElasticsearchDocumentMutationResult {
    id: string
    index: string
    result: string
    status: number
    rawBody: string
}
