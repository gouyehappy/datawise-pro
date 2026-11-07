import {resolveSqlDialectFile} from '@sql-editor/completion/dialect-aliases'
import type {SqlParserDialect} from './types'

/**
 * 连接类型 / 关键字配置文件名 → dt-sql-parser 方言。
 * 无专用 grammar 的库（Oracle、SQL Server、SQLite 等）回退 generic。
 */
export const SQL_PARSER_DIALECT_ALIASES: Record<string, SqlParserDialect> = {
    mysql: 'mysql',
    mariadb: 'mysql',
    oceanbase: 'mysql',
    tidb: 'mysql',
    starrocks: 'mysql',
    doris: 'mysql',
    postgresql: 'postgresql',
    postgres: 'postgresql',
    kingbase: 'postgresql',
    flink: 'flink',
    spark: 'spark',
    hive: 'hive',
    presto: 'trino',
    trino: 'trino',
    impala: 'impala',
    // 无专用 parser → generic
    oracle: 'generic',
    dm: 'generic',
    sqlserver: 'generic',
    mssql: 'generic',
    db2: 'generic',
    sqlite: 'generic',
    clickhouse: 'generic',
    common: 'generic',
}

const KEYWORD_FILE_TO_PARSER: Record<string, SqlParserDialect> = {
    mysql: 'mysql',
    postgresql: 'postgresql',
    flink: 'flink',
    hive: 'hive',
    oracle: 'generic',
    sqlserver: 'generic',
    sqlite: 'generic',
    clickhouse: 'generic',
}

/** 将 dbType / dialect 字符串解析为 SqlParserDialect */
export function resolveSqlParserDialect(dialect?: string | null): SqlParserDialect {
    if (!dialect) return 'mysql'
    const normalized = dialect.toLowerCase().trim()
    if (!normalized) return 'mysql'
    const direct = SQL_PARSER_DIALECT_ALIASES[normalized]
    if (direct) return direct
    const keywordFile = resolveSqlDialectFile(normalized)
    if (keywordFile && KEYWORD_FILE_TO_PARSER[keywordFile]) {
        return KEYWORD_FILE_TO_PARSER[keywordFile]
    }
    return 'generic'
}
