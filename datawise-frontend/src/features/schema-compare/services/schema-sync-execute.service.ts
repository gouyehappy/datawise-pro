import type {DbType} from '@/core/types'
import {executeSqlBatch} from '@/features/workspace/services/sql-batch-execute.service'
import {resolveRunSqlBatch} from '@/features/workspace/services/run-sql-batch.service'

export type ExecuteSchemaSyncResult =
    | {ok: true; statementCount: number}
    | {ok: false; message: string}

/** 在目标连接执行 Schema 同步 DDL（支持多语句） */
export async function executeSchemaSyncSql(
    sql: string,
    connection: {
        connectionId: string
        database?: string
        dbType?: DbType
    },
): Promise<ExecuteSchemaSyncResult> {
    const batch = resolveRunSqlBatch(sql)
    if (!batch.length) {
        return {ok: false, message: 'Empty SQL'}
    }
    const result = await executeSqlBatch(batch, {
        connectionId: connection.connectionId,
        database: connection.database,
        dbType: connection.dbType,
        perfSource: 'schema-sync',
    })
    if (result.lastErrorMessage) {
        return {ok: false, message: result.lastErrorMessage}
    }
    return {ok: true, statementCount: batch.length}
}
