import type {DbType} from '@/core/types'
import {executeSqlBatch} from '@/features/workspace/services/sql-batch-execute.service'
import {resolveRunSqlBatch} from '@/features/workspace/services/run-sql-batch.service'
import {
    classifyDeployAtomicity,
    resolveDeployOutcome,
    type DeployAtomicity,
    type DeployOutcome,
} from '@/features/schema-compare/services/deploy-atomicity.service'

export type ExecuteSchemaSyncResult =
    | {
        ok: true
        statementCount: number
        atomicity: DeployAtomicity
        outcome: DeployOutcome
    }
    | {
        ok: false
        message: string
        atomicity: DeployAtomicity
        outcome: DeployOutcome
        executedCount?: number
    }

/** 在目标连接执行 Schema 同步 DDL（支持多语句）；附带部署原子性诚实结果（T-SCHEMA-1）。 */
export async function executeSchemaSyncSql(
    sql: string,
    connection: {
        connectionId: string
        database?: string
        dbType?: DbType
    },
): Promise<ExecuteSchemaSyncResult> {
    const atomicity = classifyDeployAtomicity({sql, dbType: connection.dbType})
    const batch = resolveRunSqlBatch(sql)
    if (!batch.length) {
        return {
            ok: false,
            message: 'Empty SQL',
            atomicity,
            outcome: 'failed',
            executedCount: 0,
        }
    }
    const result = await executeSqlBatch(batch, {
        connectionId: connection.connectionId,
        database: connection.database,
        dbType: connection.dbType,
        perfSource: 'schema-sync',
    })
    const executedCount = result.lastErrorMessage
        ? Math.max(0, batch.length - 1)
        : batch.length
    if (result.lastErrorMessage) {
        return {
            ok: false,
            message: result.lastErrorMessage,
            atomicity,
            outcome: resolveDeployOutcome({
                atomicity,
                ok: false,
                executedCount,
                totalStatements: batch.length,
            }),
            executedCount,
        }
    }
    return {
        ok: true,
        statementCount: batch.length,
        atomicity,
        outcome: 'committed',
    }
}

export function previewSchemaSyncAtomicity(sql: string, dbType?: DbType): DeployAtomicity {
    return classifyDeployAtomicity({sql, dbType})
}
