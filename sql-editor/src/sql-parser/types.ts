import type {
    CaretPosition,
    EntityContext,
    ParseError,
    TextSlice,
} from 'dt-sql-parser'

/** dt-sql-parser 原生方言（每类对应独立 ANTLR grammar） */
export type SqlParserDialect =
    | 'mysql'
    | 'postgresql'
    | 'flink'
    | 'spark'
    | 'hive'
    | 'trino'
    | 'impala'
    | 'generic'

export type {CaretPosition, EntityContext, ParseError as SqlParseError, TextSlice as SqlStatementSlice}

export const SQL_PARSER_DIALECTS = [
    'mysql',
    'postgresql',
    'flink',
    'spark',
    'hive',
    'trino',
    'impala',
    'generic',
] as const satisfies readonly SqlParserDialect[]
