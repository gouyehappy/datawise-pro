import {requiresDdlAccess, requiresWriteAccess} from '@/features/team/services/connection-access.service'
import {analyzeDangerousSql} from '@/features/workspace/services/dangerous-sql-preview.service'
import {resolveRunSqlBatch} from '@/features/workspace/services/run-sql-batch.service'

export interface RestorePreflightSummary {
    fileName: string
    statementCount: number
    writeCount: number
    ddlCount: number
    dropCount: number
    dangerousCount: number
    fullTableRiskCount: number
    /** i18n message keys under explorer.restoreWizard.hints.* */
    hintKeys: string[]
    /** Highest risk for UI tone */
    riskLevel: 'low' | 'medium' | 'high'
}

const DROP_PREFIX = /^\s*DROP\b/i
const DDL_PREFIX = /^\s*(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i

export function analyzeRestoreSqlPreflight(sql: string, fileName: string): RestorePreflightSummary | null {
    const batch = resolveRunSqlBatch(sql)
    if (!batch.length) return null

    let writeCount = 0
    let ddlCount = 0
    let dropCount = 0
    let dangerousCount = 0
    let fullTableRiskCount = 0

    for (const statement of batch) {
        if (requiresWriteAccess(statement)) writeCount += 1
        if (requiresDdlAccess(statement) || DDL_PREFIX.test(statement)) ddlCount += 1
        if (DROP_PREFIX.test(statement)) dropCount += 1

        const dangerous = analyzeDangerousSql(statement)
        if (dangerous) {
            dangerousCount += 1
            if (dangerous.fullTableRisk) fullTableRiskCount += 1
        }
    }

    const hintKeys: string[] = []
    if (dropCount > 0) hintKeys.push('hasDrop')
    if (ddlCount > 0) hintKeys.push('hasDdl')
    if (dangerousCount > 0) hintKeys.push('hasDangerous')
    if (fullTableRiskCount > 0) hintKeys.push('hasFullTableRisk')
    if (writeCount > 0) hintKeys.push('needsWrite')
    if (hintKeys.length === 0) hintKeys.push('readOnly')

    let riskLevel: RestorePreflightSummary['riskLevel'] = 'low'
    if (dropCount > 0 || fullTableRiskCount > 0) {
        riskLevel = 'high'
    } else if (ddlCount > 0 || dangerousCount > 0 || writeCount > 0) {
        riskLevel = 'medium'
    }

    return {
        fileName,
        statementCount: batch.length,
        writeCount,
        ddlCount,
        dropCount,
        dangerousCount,
        fullTableRiskCount,
        hintKeys,
        riskLevel,
    }
}

export function restoreNeedsWritePermission(summary: RestorePreflightSummary): boolean {
    return summary.writeCount > 0 || summary.ddlCount > 0
}

export function restoreNeedsDdlPermission(summary: RestorePreflightSummary): boolean {
    return summary.ddlCount > 0 || summary.dropCount > 0
}
