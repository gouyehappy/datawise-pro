/**
 * 多方言 SQL 解析 — 基于 [dt-sql-parser](https://github.com/DTStack/dt-sql-parser)
 *
 * 与补全 grammar（completion/grammar）并行：
 * - 本模块：AST / 校验 / 拆句 / 实体提取（MySQL、Flink、Spark、Hive…）
 * - 补全 grammar：光标态补全（轻量、可定制）
 *
 * @example
 * ```ts
 * import { getSqlParser, extractReferencedTables } from '@datawise/sql-editor/sql-parser'
 *
 * const parser = await getSqlParser('flink')
 * const errors = parser.validate('SELECT * FORM t')
 * const tables = extractReferencedTables(parser.getAllEntities('SELECT * FROM orders'))
 * ```
 */

export {SqlParser} from './sql-parser'
export {
    resolveSqlParserDialect,
    SQL_PARSER_DIALECT_ALIASES,
} from './dialect'
export {extractReferencedColumns, extractReferencedTables} from './entities'
export type {
    CaretPosition,
    EntityContext,
    SqlParseError,
    SqlParserDialect,
    SqlStatementSlice,
} from './types'
export {SQL_PARSER_DIALECTS} from './types'

import {resolveSqlParserDialect} from './dialect'
import {SqlParser} from './sql-parser'
import type {SqlParserDialect} from './types'

const parserCache = new Map<SqlParserDialect, Promise<SqlParser>>()

/** 获取（并缓存）指定方言的解析器实例；按方言懒加载 grammar */
export function getSqlParser(dialect?: string | null): Promise<SqlParser> {
    const key = resolveSqlParserDialect(dialect)
    let pending = parserCache.get(key)
    if (!pending) {
        pending = SqlParser.create(key)
        parserCache.set(key, pending)
    }
    return pending
}

/** 预加载解析器（如设置页切换方言时） */
export function preloadSqlParser(dialect?: string | null): Promise<SqlParser> {
    return getSqlParser(dialect)
}

/** 测试 / 热切换方言时清空实例缓存 */
export function resetSqlParserCache(): void {
    parserCache.clear()
}
