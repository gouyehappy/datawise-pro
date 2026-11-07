import type {
    CaretPosition,
    EntityContext,
    ParseError,
    Suggestions,
    TextSlice,
} from 'dt-sql-parser'
import type {SqlParserDialect} from './types'

/** dt-sql-parser 实例共用的最小表面（便于按方言分包懒加载） */
export interface SqlParserBackend {
    parse(input: string): unknown

    validate(input: string): ParseError[]

    splitSQLByStatement(input: string): TextSlice[] | null

    getAllTokens(input: string): unknown[]

    getAllEntities(input: string, caretPosition?: CaretPosition): EntityContext[] | null

    getSuggestionAtCaretPosition(sql: string, caret: CaretPosition): Suggestions | null
}

type ParserCtor = new () => SqlParserBackend

/** 按方言动态 import，避免一次打入全部 ANTLR grammar */
const LOADERS: Record<SqlParserDialect, () => Promise<ParserCtor>> = {
    mysql: () =>
        import('dt-sql-parser/dist/parser/mysql/index.js').then((m) => m.MySQL as ParserCtor),
    postgresql: () =>
        import('dt-sql-parser/dist/parser/postgresql/index.js').then((m) => m.PostgreSQL as ParserCtor),
    flink: () =>
        import('dt-sql-parser/dist/parser/flink/index.js').then((m) => m.FlinkSQL as ParserCtor),
    spark: () =>
        import('dt-sql-parser/dist/parser/spark/index.js').then((m) => m.SparkSQL as ParserCtor),
    hive: () =>
        import('dt-sql-parser/dist/parser/hive/index.js').then((m) => m.HiveSQL as ParserCtor),
    trino: () =>
        import('dt-sql-parser/dist/parser/trino/index.js').then((m) => m.TrinoSQL as ParserCtor),
    impala: () =>
        import('dt-sql-parser/dist/parser/impala/index.js').then((m) => m.ImpalaSQL as ParserCtor),
    generic: () =>
        import('dt-sql-parser/dist/parser/generic/index.js').then((m) => m.GenericSQL as ParserCtor),
}

export async function loadSqlParserBackend(dialect: SqlParserDialect): Promise<SqlParserBackend> {
    const Ctor = await LOADERS[dialect]()
    return new Ctor()
}
