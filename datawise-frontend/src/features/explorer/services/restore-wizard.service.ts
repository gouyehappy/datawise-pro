import type {TreeNode} from '@/core/types'
import {findAncestorByType} from '@/core/utils/tree'
import {
    isProductionEnvironment,
    normalizeConnectionEnvironment,
    type ConnectionEnvironment,
} from '@/features/connection/services/connection-environment.service'
import {
    analyzeRestoreSqlPreflight,
    type RestorePreflightSummary,
} from '@/features/explorer/services/restore-preflight.service'
import {pickSqlFile} from '@/features/explorer/services/run-sql-file.service'

export interface RestoreWizardContext {
    connectionId: string
    connectionLabel?: string
    database: string
    databaseNodeId: string
    env: ConnectionEnvironment
    envCustom?: string
    isProduction: boolean
}

export interface RestoreWizardFileState {
    fileName: string
    sql: string
    preflight: RestorePreflightSummary
}

export function resolveRestoreWizardContext(
    tree: TreeNode[],
    databaseNode: TreeNode,
    connectionLabel?: string,
): RestoreWizardContext | null {
    if (databaseNode.type !== 'database') return null
    const connection = findAncestorByType(tree, databaseNode.id, 'connection')
    if (!connection?.id) return null
    const normalized = normalizeConnectionEnvironment(connection.env, connection.envCustom)
    return {
        connectionId: connection.id,
        connectionLabel: connectionLabel ?? connection.label,
        database: databaseNode.label,
        databaseNodeId: databaseNode.id,
        env: normalized.env,
        envCustom: normalized.envCustom,
        isProduction: isProductionEnvironment(connection.env, connection.envCustom),
    }
}

export async function loadRestoreWizardFile(): Promise<RestoreWizardFileState | null> {
    const file = await pickSqlFile()
    if (!file) return null
    const sql = await file.text()
    const preflight = analyzeRestoreSqlPreflight(sql, file.name)
    if (!preflight) return null
    return {fileName: file.name, sql, preflight}
}

export {
    resolveRestoreWizardMessageKey,
    type RestoreWizardMessageKind,
} from '@/features/explorer/services/restore-wizard-messages'
