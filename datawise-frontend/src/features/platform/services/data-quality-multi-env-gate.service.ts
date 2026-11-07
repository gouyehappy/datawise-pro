import type {TreeNode} from '@/core/types'
import {
    resolveConnectionEnvironmentLabel,
} from '@/features/connection/services/connection-environment.service'
import type {
    DataQualityGatePair,
    DataQualityGateResult,
    DataQualityGateScopeResult,
} from '@/features/platform/types/platform.types'

export interface DataQualityReferenceConnectionOption {
    value: string
    label: string
    envLabel: string
}

/** Other connections for multi-env gate (exclude current). */
export function listDataQualityReferenceConnections(
    tree: readonly TreeNode[],
    currentConnectionId: string | null | undefined,
    t: (key: string, params?: Record<string, unknown>) => string,
): DataQualityReferenceConnectionOption[] {
    const current = currentConnectionId?.trim() ?? ''
    const options: DataQualityReferenceConnectionOption[] = []
    const walk = (nodes: readonly TreeNode[]) => {
        for (const node of nodes) {
            if (node.type === 'connection' && node.id !== current) {
                const envLabel = resolveConnectionEnvironmentLabel(node.env, node.envCustom, t)
                options.push({
                    value: node.id,
                    label: `${node.label || node.id} (${envLabel})`,
                    envLabel,
                })
            }
            if (node.children?.length) walk(node.children)
        }
    }
    walk(tree)
    return options
}

export function countUnpairedGatePairs(pairs: readonly DataQualityGatePair[] | null | undefined): number {
    if (!pairs?.length) return 0
    return pairs.filter((pair) => !pair.paired).length
}

export function summarizeMultiEnvGate(
    result: DataQualityGateResult,
    scopeLabel: (scope: DataQualityGateScopeResult, index: number) => string,
): {passed: boolean; summaryParts: string[]; unpaired: number} {
    const scopes = result.scopes?.length ? result.scopes : null
    const parts: string[] = []
    if (!scopes) {
        parts.push(`${result.failed}/${result.total}`)
    } else {
        for (let index = 0; index < scopes.length; index++) {
            const scope = scopes[index]
            const label = scopeLabel(scope, index)
            parts.push(`${label}: ${scope.failed}/${scope.total}`)
        }
    }
    return {
        passed: result.passed,
        summaryParts: parts,
        unpaired: countUnpairedGatePairs(result.pairs),
    }
}

/** JSON payload for copy/download after a release-gate run. */
export function formatDataQualityGateExport(result: DataQualityGateResult): string {
    return JSON.stringify(
        {
            passed: result.passed,
            total: result.total,
            failed: result.failed,
            scopes: result.scopes ?? undefined,
            pairs: result.pairs ?? undefined,
            results: result.results,
            exportedAt: new Date().toISOString(),
        },
        null,
        2,
    )
}

export function buildDataQualityGateExportFilename(result: DataQualityGateResult, at = new Date()): string {
    const stamp = at.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const verdict = result.passed ? 'passed' : 'failed'
    return `dq-gate-${verdict}-${stamp}.json`
}
