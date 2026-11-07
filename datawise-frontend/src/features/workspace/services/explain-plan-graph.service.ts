import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'
import {
    classifyExplainPlanNodeRisk,
    type ExplainPlanRiskLevel,
} from '@/features/workspace/services/explain-plan-risk.service'

export interface ExplainPlanGraphLayoutNode {
    id: string
    label: string
    detail?: string
    depth: number
    x: number
    y: number
    width: number
    height: number
    risk: ExplainPlanRiskLevel
    parentId?: string
}

export interface ExplainPlanGraphLayout {
    nodes: ExplainPlanGraphLayoutNode[]
    edges: Array<{fromId: string; toId: string}>
    width: number
    height: number
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 52
const H_GAP = 36
const V_GAP = 28
const PAD = 24

function flattenWithDepth(
    nodes: ExplainPlanNode[],
    depth = 0,
    parentId?: string,
): Array<{node: ExplainPlanNode; depth: number; parentId?: string}> {
    const out: Array<{node: ExplainPlanNode; depth: number; parentId?: string}> = []
    for (const node of nodes) {
        out.push({node, depth, parentId})
        if (node.children?.length) {
            out.push(...flattenWithDepth(node.children, depth + 1, node.id))
        }
    }
    return out
}

/** 自上而下的简易树布局（同层按出现顺序横排） */
export function layoutExplainPlanGraph(roots: ExplainPlanNode[]): ExplainPlanGraphLayout {
    const flat = flattenWithDepth(roots)
    if (!flat.length) {
        return {nodes: [], edges: [], width: PAD * 2, height: PAD * 2}
    }

    const depthCounts = new Map<number, number>()
    const depthCursor = new Map<number, number>()
    for (const item of flat) {
        depthCounts.set(item.depth, (depthCounts.get(item.depth) ?? 0) + 1)
        depthCursor.set(item.depth, 0)
    }

    const maxDepth = Math.max(...flat.map((item) => item.depth))
    const maxBreadth = Math.max(...depthCounts.values())
    const width = PAD * 2 + maxBreadth * NODE_WIDTH + Math.max(0, maxBreadth - 1) * H_GAP
    const height = PAD * 2 + (maxDepth + 1) * NODE_HEIGHT + maxDepth * V_GAP

    const nodes: ExplainPlanGraphLayoutNode[] = []
    const edges: Array<{fromId: string; toId: string}> = []

    for (const item of flat) {
        const count = depthCounts.get(item.depth) ?? 1
        const index = depthCursor.get(item.depth) ?? 0
        depthCursor.set(item.depth, index + 1)
        const rowWidth = count * NODE_WIDTH + Math.max(0, count - 1) * H_GAP
        const startX = PAD + (width - PAD * 2 - rowWidth) / 2
        const x = startX + index * (NODE_WIDTH + H_GAP)
        const y = PAD + item.depth * (NODE_HEIGHT + V_GAP)
        const risk = classifyExplainPlanNodeRisk(item.node).level
        nodes.push({
            id: item.node.id,
            label: item.node.label,
            detail: item.node.detail,
            depth: item.depth,
            x,
            y,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            risk,
            parentId: item.parentId,
        })
        if (item.parentId) {
            edges.push({fromId: item.parentId, toId: item.node.id})
        }
    }

    return {nodes, edges, width, height}
}

export const EXPLAIN_PLAN_GRAPH_NODE = {
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
} as const
