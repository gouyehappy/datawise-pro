import type {LineageColumnMappingDto, LineageGraph, LineageNode} from '@/features/lineage/types/lineage.types'

export interface LineageSourceColumn {
    id: string
    table: string
    column: string
    qualifiedName: string
    kind?: string
}

export interface LineageOutputMapping {
    id: string
    column: string
    qualifiedName: string
    sources: LineageSourceColumn[]
    transform: string | null
}

export interface LineageSourceGroup {
    table: string
    columns: LineageSourceColumn[]
}

export interface ColumnLineageMap {
    modelName: string
    outputs: LineageOutputMapping[]
    sourceGroups: LineageSourceGroup[]
}

export interface ColumnLineageLayoutField {
    id: string
    label: string
    rowIndex: number
    y: number
    transform: boolean
    portX: number
    portY: number
}

export interface ColumnLineageLayoutEntity {
    id: string
    name: string
    side: 'source' | 'output'
    x: number
    y: number
    width: number
    height: number
    headerHeight: number
    fields: ColumnLineageLayoutField[]
}

export interface ColumnLineageLayoutLink {
    id: string
    sourceId: string
    outputId: string
    transform: boolean
    expression: string | null
    path: string
    labelX: number
    labelY: number
    showExpression: boolean
    labelLines: string[]
    labelWidth: number
    labelHeight: number
}

export interface ColumnLineageLayout {
    map: ColumnLineageMap
    entities: ColumnLineageLayoutEntity[]
    links: ColumnLineageLayoutLink[]
    width: number
    height: number
    sourceColumnX: number
    outputColumnX: number
    linkCorridorX: number
    linkCorridorWidth: number
}

const ROW_HEIGHT = 32
const ENTITY_HEADER = 40
const ENTITY_GAP = 36
const PANEL_PADDING = 28
const PANEL_TITLE_HEIGHT = 24
const ENTITY_WIDTH = 252
const LINK_CORRIDOR = 420

/** 从 API 的 SELECT 解析结果构建「模型字段 → 上游表字段」映射 */
export function buildColumnLineageMap(graph: LineageGraph | null): ColumnLineageMap | null {
    if (!graph) return null

    const modelName = graph.root?.label ?? 'model'

    if (graph.columnMappings?.length) {
        return buildFromColumnMappings(modelName, graph.columnMappings)
    }

    return buildFromGraphNodes(graph, modelName)
}

function buildFromColumnMappings(
    modelName: string,
    mappings: LineageColumnMappingDto[],
): ColumnLineageMap {
    const outputs: LineageOutputMapping[] = mappings.map((row) => {
        const sources = row.sources.map((source) => toSourceColumn(source))
        return {
            id: `out:${modelName}:${row.outputColumn}`,
            column: row.outputColumn,
            qualifiedName: `${modelName}.${row.outputColumn}`,
            sources,
            transform: row.expression ?? null,
        }
    })

    return {
        modelName,
        outputs,
        sourceGroups: orderSourceGroupsByOutputs(groupSources(outputs), outputs),
    }
}

function toSourceColumn(source: LineageColumnMappingDto['sources'][number]): LineageSourceColumn {
    const table = qualifyTable(source.schema, source.table)
    const id = `col:${table}.${source.column}`
    return {
        id,
        table,
        column: source.column,
        qualifiedName: source.qualifiedName,
        kind: source.kind ?? undefined,
    }
}

function qualifyTable(schema: string | null | undefined, table: string | null | undefined): string {
    if (schema && table) return `${schema}.${table}`
    return table ?? 'unknown'
}

function groupSources(outputs: LineageOutputMapping[]): LineageSourceGroup[] {
    const sourceById = new Map<string, LineageSourceColumn>()
    for (const output of outputs) {
        for (const source of output.sources) {
            sourceById.set(source.id, source)
        }
    }
    const groupMap = new Map<string, LineageSourceColumn[]>()
    for (const source of sourceById.values()) {
        const bucket = groupMap.get(source.table) ?? []
        bucket.push(source)
        groupMap.set(source.table, bucket)
    }
    return [...groupMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([table, columns]) => ({
            table,
            columns: columns.sort((a, b) => a.column.localeCompare(b.column)),
        }))
}

function orderSourceGroupsByOutputs(
    groups: LineageSourceGroup[],
    outputs: LineageOutputMapping[],
): LineageSourceGroup[] {
    const orderIndex = new Map<string, number>()
    outputs.forEach((output, idx) => {
        for (const source of output.sources) {
            if (!orderIndex.has(source.id)) {
                orderIndex.set(source.id, idx)
            }
        }
    })
    return groups.map((group) => ({
        ...group,
        columns: [...group.columns].sort((a, b) => {
            const ia = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER
            const ib = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER
            return ia - ib || a.column.localeCompare(b.column)
        }),
    }))
}

function buildFromGraphNodes(graph: LineageGraph, modelName: string): ColumnLineageMap | null {
    if (!graph.nodes?.length) return null

    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
    const incoming = new Map<string, typeof graph.edges>()
    for (const edge of graph.edges) {
        const bucket = incoming.get(edge.to) ?? []
        bucket.push(edge)
        incoming.set(edge.to, bucket)
    }

    const outputs = graph.nodes
        .filter((node) => node.id.startsWith('out:'))
        .map((node) => {
            const traced = traceSources(node.id, nodeById, incoming)
            return {
                id: node.id,
                column: node.label,
                qualifiedName: node.qualifiedName ?? `${modelName}.${node.label}`,
                sources: traced.sources,
                transform: traced.transform,
            }
        })

    if (!outputs.length) return null

    return {
        modelName,
        outputs,
        sourceGroups: orderSourceGroupsByOutputs(groupSources(outputs), outputs),
    }
}

function traceSources(
    outputId: string,
    nodeById: Map<string, LineageNode>,
    incoming: Map<string, LineageGraph['edges']>,
): {sources: LineageSourceColumn[]; transform: string | null} {
    const sources = new Map<string, LineageSourceColumn>()
    let transform: string | null = null
    const visited = new Set<string>()

    function walk(nodeId: string) {
        if (visited.has(nodeId)) return
        visited.add(nodeId)

        const node = nodeById.get(nodeId)
        if (!node) return

        if (nodeId.startsWith('col:') || nodeId.startsWith('vmcol:')) {
            sources.set(nodeId, toSourceColumnFromNode(node, nodeId))
            return
        }

        if (node.kind === 'expression') {
            transform = transform ?? node.expression ?? node.label
        }

        for (const edge of incoming.get(nodeId) ?? []) {
            if (edge.from.startsWith('model:')) continue
            walk(edge.from)
        }
    }

    walk(outputId)
    return {
        sources: [...sources.values()].sort((a, b) =>
            `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`),
        ),
        transform,
    }
}

function toSourceColumnFromNode(node: LineageNode, nodeId: string): LineageSourceColumn {
    const qualifiedName = node.qualifiedName ?? node.label
    const table = extractTableName(qualifiedName, nodeId)
    return {id: nodeId, table, column: node.label, qualifiedName}
}

function extractTableName(qualifiedName: string, nodeId: string): string {
    if (qualifiedName.includes('.')) {
        const parts = qualifiedName.split('.')
        return parts.slice(0, -1).join('.')
    }
    if (nodeId.startsWith('vmcol:')) {
        const body = nodeId.slice('vmcol:'.length)
        const idx = body.lastIndexOf(':')
        return idx >= 0 ? body.slice(0, idx) : body
    }
    if (nodeId.startsWith('col:')) {
        const body = nodeId.slice('col:'.length)
        const idx = body.lastIndexOf('.')
        return idx >= 0 ? body.slice(0, idx) : body
    }
    return qualifiedName
}

function buildEntity(
    id: string,
    name: string,
    side: 'source' | 'output',
    x: number,
    y: number,
    fieldDefs: Array<{id: string; label: string; transform?: boolean}>,
): ColumnLineageLayoutEntity {
    const fields: ColumnLineageLayoutField[] = fieldDefs.map((field, rowIndex) => {
        const rowY = y + ENTITY_HEADER + rowIndex * ROW_HEIGHT
        const centerY = rowY + ROW_HEIGHT / 2
        return {
            id: field.id,
            label: field.label,
            rowIndex,
            y: rowY,
            transform: field.transform ?? false,
            portX: side === 'source' ? x + ENTITY_WIDTH : x,
            portY: centerY,
        }
    })

    return {
        id,
        name,
        side,
        x,
        y,
        width: ENTITY_WIDTH,
        height: ENTITY_HEADER + fieldDefs.length * ROW_HEIGHT,
        headerHeight: ENTITY_HEADER,
        fields,
    }
}

export function layoutColumnLineageMap(map: ColumnLineageMap | null): ColumnLineageLayout | null {
    if (!map) return null

    const sourceColumnX = PANEL_PADDING
    const outputColumnX = sourceColumnX + ENTITY_WIDTH + LINK_CORRIDOR
    const entities: ColumnLineageLayoutEntity[] = []
    const fieldById = new Map<string, ColumnLineageLayoutField>()

    let sourceY = PANEL_PADDING + PANEL_TITLE_HEIGHT
    for (const group of map.sourceGroups) {
        const entity = buildEntity(
            `entity:source:${group.table}`,
            group.table,
            'source',
            sourceColumnX,
            sourceY,
            group.columns.map((column) => ({id: column.id, label: column.column})),
        )
        entities.push(entity)
        for (const field of entity.fields) {
            fieldById.set(field.id, field)
        }
        sourceY += entity.height + ENTITY_GAP
    }

    const outputEntity = buildEntity(
        `entity:output:${map.modelName}`,
        map.modelName,
        'output',
        outputColumnX,
        PANEL_PADDING + PANEL_TITLE_HEIGHT,
        map.outputs.map((output) => ({
            id: output.id,
            label: output.column,
            transform: Boolean(output.transform),
        })),
    )
    entities.push(outputEntity)
    for (const field of outputEntity.fields) {
        fieldById.set(field.id, field)
    }

    const links: ColumnLineageLayoutLink[] = []
    for (const output of map.outputs) {
        const outputField = fieldById.get(output.id)
        if (!outputField) continue
        for (const source of output.sources) {
            const sourceField = fieldById.get(source.id)
            if (!sourceField) continue
            const geometry = buildLinkGeometry(sourceField, outputField)
            links.push({
                id: `${source.id}->${output.id}`,
                sourceId: source.id,
                outputId: output.id,
                transform: Boolean(output.transform),
                expression: output.transform,
                path: geometry.path,
                labelX: geometry.labelX,
                labelY: geometry.labelY,
                showExpression: false,
                labelLines: [],
                labelWidth: 0,
                labelHeight: 0,
            })
        }
    }

    attachExpressionLabelsOnLinks(links, fieldById)

    const linkCorridorX = sourceColumnX + ENTITY_WIDTH

    const leftBottom = sourceY
    const rightBottom = outputEntity.y + outputEntity.height + PANEL_PADDING
    const height = Math.max(leftBottom, rightBottom, 360)
    const width = outputColumnX + ENTITY_WIDTH + PANEL_PADDING

    return {
        map,
        entities,
        links,
        width,
        height,
        sourceColumnX,
        outputColumnX,
        linkCorridorX,
        linkCorridorWidth: LINK_CORRIDOR,
    }
}

interface LinkGeometry {
    path: string
    labelX: number
    labelY: number
}

function buildLinkGeometry(
    from: ColumnLineageLayoutField,
    to: ColumnLineageLayoutField,
): LinkGeometry {
    const startX = from.portX
    const startY = from.portY
    const endX = to.portX
    const endY = to.portY

    if (Math.abs(startY - endY) < 2) {
        return {
            path: `M ${startX} ${startY} L ${endX} ${endY}`,
            labelX: (startX + endX) / 2,
            labelY: startY,
        }
    }

    const midX = (startX + endX) / 2
    const midpoint = cubicBezierPoint(
        {x: startX, y: startY},
        {x: midX, y: startY},
        {x: midX, y: endY},
        {x: endX, y: endY},
        0.5,
    )
    return {
        path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
        labelX: midpoint.x,
        labelY: midpoint.y,
    }
}

function cubicBezierPoint(
    p0: {x: number; y: number},
    p1: {x: number; y: number},
    p2: {x: number; y: number},
    p3: {x: number; y: number},
    t: number,
): {x: number; y: number} {
    const u = 1 - t
    const tt = t * t
    const uu = u * u
    return {
        x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
        y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
    }
}

function attachExpressionLabelsOnLinks(
    links: ColumnLineageLayoutLink[],
    fieldById: Map<string, ColumnLineageLayoutField>,
): void {
    const byOutput = new Map<string, ColumnLineageLayoutLink[]>()
    for (const link of links) {
        if (!link.transform || !link.expression) continue
        const bucket = byOutput.get(link.outputId) ?? []
        bucket.push(link)
        byOutput.set(link.outputId, bucket)
    }

    for (const group of byOutput.values()) {
        const target = pickExpressionLink(group, fieldById)
        if (!target?.expression) continue
        const compact = compactExpressionForLink(target.expression)
        target.showExpression = true
        target.labelLines = [compact]
        target.labelWidth = Math.max(44, compact.length * 6.2 + 14)
        target.labelHeight = 20
    }
}

function pickExpressionLink(
    links: ColumnLineageLayoutLink[],
    fieldById: Map<string, ColumnLineageLayoutField>,
): ColumnLineageLayoutLink | null {
    if (!links.length) return null
    if (links.length === 1) return links[0]

    let best = links[0]
    let bestDelta = Number.POSITIVE_INFINITY
    for (const link of links) {
        const source = fieldById.get(link.sourceId)
        const output = fieldById.get(link.outputId)
        if (!source || !output) continue
        const delta = Math.abs(source.portY - output.portY)
        if (delta < bestDelta) {
            bestDelta = delta
            best = link
        }
    }
    return best
}

function compactExpressionForLink(expression: string, maxLen = 24): string {
    const normalized = expression.replace(/\s+/g, ' ').trim()
    if (normalized.length <= maxLen) return normalized

    const funcMatch = normalized.match(/^([A-Za-z_][\w]*)\s*\(/)
    if (funcMatch) {
        return `${funcMatch[1]}(...)`
    }

    return `${normalized.slice(0, maxLen - 1)}…`
}

export function hasColumnLineage(map: ColumnLineageMap | null): boolean {
    return Boolean(map?.outputs.length)
}

export function findLayoutField(
    layout: ColumnLineageLayout | null,
    fieldId: string,
): ColumnLineageLayoutField | null {
    if (!layout) return null
    for (const entity of layout.entities) {
        const field = entity.fields.find((item) => item.id === fieldId)
        if (field) return field
    }
    return null
}
