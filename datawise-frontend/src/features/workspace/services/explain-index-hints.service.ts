import type {DbType} from '@/core/types'
import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'
import {t} from '@/i18n'

export interface ExplainIndexHint {
    id: string
    severity: 'warning' | 'info'
    message: string
    suggestion?: string
    /** 计划节点关联的表名（若可解析），供一键生成该表索引草稿 */
    table?: string
}

function walkNodes(nodes: ExplainPlanNode[], visit: (node: ExplainPlanNode) => void) {
    for (const node of nodes) {
        visit(node)
        if (node.children?.length) walkNodes(node.children, visit)
    }
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

export function buildExplainIndexHints(
    nodes: ExplainPlanNode[],
    dbType?: DbType,
): ExplainIndexHint[] {
    const hints: ExplainIndexHint[] = []
    let hintIndex = 0

    walkNodes(nodes, (node) => {
        const metrics = node.metrics
        const label = node.label
        const detail = node.detail ?? ''
        const accessType = metricValue(metrics, ['type', 'select_type', 'Node Type']).toUpperCase()
        const extra = metricValue(metrics, ['Extra', 'extra']).toLowerCase()
        const table = metricValue(metrics, ['table', 'Relation Name', 'relation name'])

        const tableName = table.trim() || undefined

        if (accessType === 'ALL' || label.toUpperCase().includes('SEQ SCAN')) {
            hints.push({
                id: `hint-${hintIndex++}`,
                severity: 'warning',
                message: tableName
                    ? t('queryResult.explainHints.fullScan', {table: tableName})
                    : t('queryResult.explainHints.fullScanGeneric'),
                suggestion: tableName
                    ? t('queryResult.explainHints.fullScanSuggest', {table: tableName})
                    : t('queryResult.explainHints.fullScanSuggestGeneric'),
                table: tableName,
            })
        }

        if (extra.includes('using filesort') || label.toLowerCase().includes('sort')) {
            hints.push({
                id: `hint-${hintIndex++}`,
                severity: 'info',
                message: tableName
                    ? t('queryResult.explainHints.filesort', {table: tableName})
                    : t('queryResult.explainHints.filesortGeneric'),
                suggestion: t('queryResult.explainHints.filesortSuggest'),
                table: tableName,
            })
        }

        if (
            (dbType === 'postgresql' || dbType === 'kingbase' || dbType === 'greenplum' || dbType === 'opengauss')
            && label.toLowerCase().includes('seq scan')
            && tableName
        ) {
            const planRows = Number(metricValue(metrics, ['Plan Rows', 'plan rows']))
            if (planRows > 1000) {
                hints.push({
                    id: `hint-${hintIndex++}`,
                    severity: 'warning',
                    message: t('queryResult.explainHints.largeSeqScan', {table: tableName, rows: planRows}),
                    suggestion: t('queryResult.explainHints.largeSeqScanSuggest', {table: tableName}),
                    table: tableName,
                })
            }
        }

        if (detail.toLowerCase().includes('using temporary')) {
            hints.push({
                id: `hint-${hintIndex++}`,
                severity: 'info',
                message: t('queryResult.explainHints.temporary'),
                suggestion: t('queryResult.explainHints.temporarySuggest'),
            })
        }
    })

    return hints
}
