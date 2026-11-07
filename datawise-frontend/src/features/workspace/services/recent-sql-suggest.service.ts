import type {SqlLogEntry} from '@/core/types'
import type {SqlRecentQuery} from '@datawise/sql-editor/types'
import {extractTableNamesFromSql} from '@/features/workspace/services/sql-history-knowledge.utils'
import {filterRecentSqlForSuggest} from '@datawise/sql-editor/utils/recent-sql'

function oneLineLabel(sql: string): string {
    const line = sql.trim().replace(/\s+/g, ' ')
    return line.length > 64 ? `${line.slice(0, 63)}…` : line
}

/** 将控制台 SQL 日志转为编辑器近期补全项（同连接/库优先由 sql-editor 排序） */
export function buildRecentQueriesFromSqlLogs(
    logs: SqlLogEntry[],
    options?: {connectionId?: string; database?: string; limit?: number},
): SqlRecentQuery[] {
    const mapped: SqlRecentQuery[] = []
    for (const log of logs) {
        const sql = log.sql?.trim()
        if (!sql || log.status === 'error') continue
        mapped.push({
            id: log.id,
            sql,
            label: oneLineLabel(sql),
            connectionId: log.connectionId,
            database: log.database,
            tables: extractTableNamesFromSql(sql),
        })
    }
    return filterRecentSqlForSuggest(mapped, '', {
        connectionId: options?.connectionId,
        database: options?.database,
        limit: options?.limit ?? 24,
    })
}
