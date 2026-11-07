export type LineageNodeKind = 'model' | 'table' | 'column' | 'expression'

export type LineageEdgeRole = 'direct' | 'transform'

export type LineageParseStatus = 'complete' | 'partial' | 'failed'

export interface LineageNodeRef {
    id: string
    label: string
    kind: string
}

export interface LineageNode {
    id: string
    kind: LineageNodeKind
    label: string
    qualifiedName?: string | null
    dataType?: string | null
    expression?: string | null
    expressionKind?: string | null
}

export interface LineageEdge {
    id: string
    from: string
    to: string
    role: LineageEdgeRole
    label?: string | null
}

export interface LineageWarning {
    code: string
    message: string
    line?: number | null
    column?: number | null
}

export interface LineageMeta {
    sqlHash: string
    parsedAt: string
    dialect: string
    parser: string
    parserVersion: string
    depth: number
    status: LineageParseStatus
    warnings: LineageWarning[]
}

export interface LineageSourceColumnDto {
    schema?: string | null
    table: string
    column: string
    qualifiedName: string
    kind?: string | null
}

export interface LineageColumnMappingDto {
    outputColumn: string
    sources: LineageSourceColumnDto[]
    expression?: string | null
}

export interface LineageGraph {
    root: LineageNodeRef
    nodes: LineageNode[]
    edges: LineageEdge[]
    meta: LineageMeta
    columnMappings?: LineageColumnMappingDto[]
}

export interface GetViewModelLineagePayload {
    connectionId: string
    instanceName: string
    name: string
    forceRefresh?: boolean
}

export interface ParseLineagePayload {
    connectionId?: string
    instanceName?: string
    name?: string
    sql?: string
    dbType?: string
    maxDepth?: number
    forceRefresh?: boolean
}

export interface GetLineageImpactPayload {
    connectionId: string
    instanceName: string
    name: string
}

export interface LineageImpactItem {
    modelName: string
    fileName: string
    staleSidecar: boolean
}

export interface LineageImpact {
    sourceModel: string
    downstream: LineageImpactItem[]
}

export interface LineageLayoutNode extends LineageNode {
    x: number
    y: number
    width: number
    height: number
}

export interface LineageLayoutEdge {
    edge: LineageEdge
    path: string
}
