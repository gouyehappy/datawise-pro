import {indexSqlStatements} from './sql-statement-index'

/** 多行语句折叠区间（1-based line numbers） */
export type SqlFoldingRange = {
    start: number
    end: number
}

/** 按分号切分：每条多行语句一个折叠区间 */
export function sqlStatementFoldingRanges(sql: string): SqlFoldingRange[] {
    return indexSqlStatements(sql)
        .filter((span) => span.endLine > span.startLine)
        .map((span) => ({
            start: span.startLine,
            end: span.endLine,
        }))
}
