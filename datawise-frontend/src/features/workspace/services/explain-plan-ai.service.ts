import type {DbType} from '@/core/types'
import type {ExplainPlanMode, ExplainPlanNode} from '@/features/workspace/types/explain-plan'
import type {AppLocale} from '@/i18n'
import {summarizeExplainPlan} from '@/features/workspace/services/index-suggestion.service'

export interface ExplainPlanInterpretPayload {
    sql: string
    nodes: ExplainPlanNode[]
    dbType?: DbType
    explainMode?: ExplainPlanMode
}

function serializePlanNodes(nodes: ExplainPlanNode[], depth = 0): string[] {
    const lines: string[] = []
    for (const node of nodes) {
        const indent = '  '.repeat(depth)
        const metrics = node.metrics
            ? Object.entries(node.metrics)
                .filter(([, value]) => value != null && String(value).trim())
                .map(([key, value]) => `${key}=${value}`)
                .join(', ')
            : ''
        lines.push(`${indent}- ${node.label}${metrics ? ` (${metrics})` : ''}`)
        if (node.children?.length) {
            lines.push(...serializePlanNodes(node.children, depth + 1))
        }
    }
    return lines
}

export function formatExplainPlanInterpretPrompt(
    payload: ExplainPlanInterpretPayload,
    locale: AppLocale,
): string {
    const language = locale === 'zh-CN' ? 'Chinese' : 'English'
    const modeLabel = payload.explainMode === 'analyze' ? 'EXPLAIN ANALYZE' : 'EXPLAIN'
    const hintSummary = summarizeExplainPlan(payload.nodes, payload.dbType)
    const tree = serializePlanNodes(payload.nodes).join('\n')

    return [
        `Explain this SQL execution plan to a DBA in ${language}. Use 4-7 concise bullet points.`,
        'Cover: scan/join strategy, estimated cost hotspots, sequential scans, and practical tuning ideas.',
        'Do not invent tables or indexes not present in the plan. Keep advice actionable.',
        '',
        'SQL:',
        '```sql',
        payload.sql.trim() || '(unknown)',
        '```',
        '',
        `Plan mode: ${modeLabel}`,
        payload.dbType ? `Database type: ${payload.dbType}` : '',
        hintSummary ? `\nHeuristic hints:\n${hintSummary}` : '',
        '',
        'Plan tree:',
        tree || '(empty)',
    ]
        .filter(Boolean)
        .join('\n')
}
