import type {
    LineageGraph,
    LineageLayoutEdge,
    LineageLayoutNode,
    LineageNode,
} from '@/features/lineage/types/lineage.types'

const NODE_WIDTH = 168
const NODE_HEIGHT = 44
const EXPR_HEIGHT = 52
const GAP_X = 120
const GAP_Y = 28
const PADDING = 48

function nodeSize(node: LineageNode): {width: number; height: number} {
    if (node.kind === 'expression') {
        return {width: NODE_WIDTH + 24, height: EXPR_HEIGHT}
    }
    return {width: NODE_WIDTH, height: NODE_HEIGHT}
}

function layerOf(node: LineageNode): number {
    if (node.id.startsWith('model:')) return 4
    if (node.id.startsWith('out:')) return 3
    if (node.kind === 'expression') return 2
    if (node.id.startsWith('col:')) return 1
    if (node.kind === 'table') return 0
    return 2
}

export function layoutLineageGraph(graph: LineageGraph | null): {
    nodes: LineageLayoutNode[]
    edges: LineageLayoutEdge[]
    width: number
    height: number
} {
    if (!graph?.nodes?.length) {
        return {nodes: [], edges: [], width: 640, height: 360}
    }

    const layers = new Map<number, LineageNode[]>()
    for (const node of graph.nodes) {
        const layer = layerOf(node)
        const bucket = layers.get(layer) ?? []
        bucket.push(node)
        layers.set(layer, bucket)
    }

    const sortedLayers = [...layers.keys()].sort((a, b) => a - b)
    const positioned = new Map<string, LineageLayoutNode>()
    let maxHeight = 0
    let maxWidth = PADDING

    for (const layer of sortedLayers) {
        const items = layers.get(layer) ?? []
        const x = PADDING + layer * (NODE_WIDTH + GAP_X)
        let y = PADDING
        for (const node of items) {
            const size = nodeSize(node)
            positioned.set(node.id, {...node, x, y, width: size.width, height: size.height})
            y += size.height + GAP_Y
            maxHeight = Math.max(maxHeight, y)
        }
        maxWidth = Math.max(maxWidth, x + NODE_WIDTH + PADDING)
    }

    const nodeById = positioned
    const edges: LineageLayoutEdge[] = graph.edges.map((edge) => {
        const from = nodeById.get(edge.from)
        const to = nodeById.get(edge.to)
        if (!from || !to) {
            return {edge, path: ''}
        }
        const startX = from.x + from.width
        const startY = from.y + from.height / 2
        const endX = to.x
        const endY = to.y + to.height / 2
        const midX = (startX + endX) / 2
        return {
            edge,
            path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
        }
    })

    return {
        nodes: [...positioned.values()],
        edges,
        width: Math.max(maxWidth, 720),
        height: Math.max(maxHeight + PADDING, 360),
    }
}

export function lineageNodeClass(kind: LineageNode['kind']): string {
    switch (kind) {
        case 'model':
            return 'lineage-node--model'
        case 'table':
            return 'lineage-node--table'
        case 'expression':
            return 'lineage-node--expression'
        default:
            return 'lineage-node--column'
    }
}
