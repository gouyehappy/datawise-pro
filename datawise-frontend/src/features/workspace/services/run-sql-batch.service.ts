import {splitSqlStatements} from '@/features/workspace/services/split-sql-statements'

/** 与控制台执行一致：单条语句不拆分，多条按分号切分 */
export function resolveRunSqlBatch(sql: string): string[] {
    const trimmed = sql.trim()
    if (!trimmed) return []
    const statements = splitSqlStatements(trimmed)
    return statements.length > 1 ? statements : [statements[0] ?? trimmed]
}
