import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'

export type ExplainPlanRiskLevel = 'warning' | 'info' | 'none'

export interface ExplainPlanNodeRisk {
    level: ExplainPlanRiskLevel
    reason?: string
}

function metricValue(metrics: Record<string, string | number> | undefined, keys: string[]): string {
    if (!metrics) return ''
    for (const key of keys) {
        const direct = metrics[key]
        if (direct != null && String(direct).trim()) return String(direct)
        const found = Object.entries(metrics).find(([name]) => name.toLowerCase() === key.toLowerCase())
        if (found?.[1] != null && String(found[1]).trim()) return String(found[1])
    }
    return ''
}

/** 单节点风险：全表扫描 / filesort / 临时表 */
export function classifyExplainPlanNodeRisk(node: ExplainPlanNode): ExplainPlanNodeRisk {
    const metrics = node.metrics
    const label = node.label
    const detail = node.detail ?? ''
    const accessType = metricValue(metrics, ['type', 'select_type', 'Node Type']).toUpperCase()
    const extra = metricValue(metrics, ['Extra', 'extra']).toLowerCase()
    const table = metricValue(metrics, ['table', 'Relation Name', 'relation name'])

    if (accessType === 'ALL' || label.toUpperCase().includes('SEQ SCAN')) {
        return {
            level: 'warning',
            reason: table ? `seq_scan:${table}` : 'seq_scan',
        }
    }

    if (extra.includes('using filesort') || label.toLowerCase().includes('sort')) {
        return {level: 'info', reason: table ? `sort:${table}` : 'sort'}
    }

    if (detail.toLowerCase().includes('using temporary') || extra.includes('using temporary')) {
        return {level: 'info', reason: 'temporary'}
    }

    return {level: 'none'}
}

export function collectExplainPlanRisks(
    nodes: ExplainPlanNode[],
): Map<string, ExplainPlanNodeRisk> {
    const map = new Map<string, ExplainPlanNodeRisk>()
    const walk = (list: ExplainPlanNode[]) => {
        for (const node of list) {
            map.set(node.id, classifyExplainPlanNodeRisk(node))
            if (node.children?.length) walk(node.children)
        }
    }
    walk(nodes)
    return map
}
