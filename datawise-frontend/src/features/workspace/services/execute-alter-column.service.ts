import type {DbType} from '@/core/types'
import {executeSqlBatch} from '@/features/workspace/services/sql-batch-execute.service'
import {resolveRunSqlBatch} from '@/features/workspace/services/run-sql-batch.service'

export type ExecuteAlterColumnResult =
    | {ok: true; statementCount: number}
    | {ok: false; message: string}

/** 执行引导式改列生成的 ALTER SQL（支持 PG 多语句） */
export async function executeAlterColumnSql(
    sql: string,
    connection: {
        connectionId: string
        database?: string
        dbType?: DbType
    },
): Promise<ExecuteAlterColumnResult> {
    const batch = resolveRunSqlBatch(sql)
    if (!batch.length) {
        return {ok: false, message: 'Empty SQL'}
    }
    const result = await executeSqlBatch(batch, {
        connectionId: connection.connectionId,
        database: connection.database,
        dbType: connection.dbType,
        perfSource: 'alter-column',
    })
    if (result.lastErrorMessage) {
        return {ok: false, message: result.lastErrorMessage}
    }
    return {ok: true, statementCount: batch.length}
}
