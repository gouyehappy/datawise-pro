export interface VisualQueryCanvasNode {
    id: string
    kind: 'from' | 'join'
    joinIndex?: number
    table: string
    alias: string
    joinType?: string
    x: number
    y: number
    width: number
    height: number
}

export interface VisualQueryCanvasEdge {
    id: string
    fromId: string
    toId: string
    label: string
}

export interface VisualQueryCanvasLayout {
    nodes: VisualQueryCanvasNode[]
    edges: VisualQueryCanvasEdge[]
    width: number
    height: number
}

export type VisualQueryCanvasPositionOverrides = Record<string, {x: number; y: number}>

const NODE_W = 168
const NODE_H = 72
const GAP_X = 56
const PAD = 24

export function layoutVisualQueryCanvas(input: {
    fromTable: string
    fromAlias: string
    joins: Array<{table: string; alias: string; type: string}>
    /** Optional free-layout offsets keyed by node id (`from`, `join-0`, …). */
    positionOverrides?: VisualQueryCanvasPositionOverrides
}): VisualQueryCanvasLayout {
    const nodes: VisualQueryCanvasNode[] = []
    const edges: VisualQueryCanvasEdge[] = []
    const overrides = input.positionOverrides ?? {}

    if (!input.fromTable.trim()) {
        return {nodes, edges, width: 480, height: 200}
    }

    const fromOverride = overrides.from
    nodes.push({
        id: 'from',
        kind: 'from',
        table: input.fromTable,
        alias: input.fromAlias || 't',
        x: fromOverride?.x ?? PAD,
        y: fromOverride?.y ?? PAD + 40,
        width: NODE_W,
        height: NODE_H,
    })

    let prevId = 'from'
    input.joins.forEach((join, index) => {
        if (!join.table.trim()) return
        const id = `join-${index}`
        const override = overrides[id]
        nodes.push({
            id,
            kind: 'join',
            joinIndex: index,
            table: join.table,
            alias: join.alias || `t${index + 2}`,
            joinType: join.type,
            x: override?.x ?? PAD + (index + 1) * (NODE_W + GAP_X),
            y: override?.y ?? PAD + 40,
            width: NODE_W,
            height: NODE_H,
        })
        edges.push({
            id: `edge-${prevId}-${id}`,
            fromId: prevId,
            toId: id,
            label: join.type || 'JOIN',
        })
        prevId = id
    })

    const maxRight = nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0)
    const maxBottom = nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0)
    const width = Math.max(
        480,
        PAD * 2 + nodes.length * NODE_W + Math.max(0, nodes.length - 1) * GAP_X,
        maxRight + PAD,
    )
    const height = Math.max(PAD * 2 + NODE_H + 80, maxBottom + PAD)
    return {nodes, edges, width, height}
}

/** Clamp a dragged node so it stays within a padded canvas area. */
export function clampCanvasNodePosition(
    x: number,
    y: number,
    nodeWidth = NODE_W,
    nodeHeight = NODE_H,
    canvasWidth = 480,
    canvasHeight = 200,
): {x: number; y: number} {
    const maxX = Math.max(PAD, canvasWidth - nodeWidth - PAD)
    const maxY = Math.max(PAD, canvasHeight - nodeHeight - PAD)
    return {
        x: Math.min(maxX, Math.max(PAD, Math.round(x))),
        y: Math.min(maxY, Math.max(PAD, Math.round(y))),
    }
}
