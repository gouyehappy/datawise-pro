import type {
    CaretPosition,
    EntityContext,
    ParseError,
    Suggestions,
    TextSlice,
} from 'dt-sql-parser'
import {loadSqlParserBackend, type SqlParserBackend} from './load-parser'
import type {SqlParserDialect} from './types'

/** 多方言 SQL 解析器门面（封装 dt-sql-parser） */
export class SqlParser {
    readonly dialect: SqlParserDialect
    private backend: SqlParserBackend

    private constructor(dialect: SqlParserDialect, backend: SqlParserBackend) {
        this.dialect = dialect
        this.backend = backend
    }

    static async create(dialect: SqlParserDialect): Promise<SqlParser> {
        const backend = await loadSqlParserBackend(dialect)
        return new SqlParser(dialect, backend)
    }

    /** 解析为 ANTLR parse tree（方言相关，类型为 ParserRuleContext） */
    parse(sql: string): unknown {
        return this.backend.parse(sql)
    }

    /** 语法校验；无错误时返回空数组 */
    validate(sql: string): ParseError[] {
        return this.backend.validate(sql)
    }

    /** 按分号拆分多语句（引号内分号不计） */
    splitStatements(sql: string): TextSlice[] | null {
        return this.backend.splitSQLByStatement(sql)
    }

    /** 词法 token 流 */
    getAllTokens(sql: string): unknown[] {
        return this.backend.getAllTokens(sql)
    }

    /** 收集 SQL 中的表 / 列 / 库等实体；可选 caret 限定可见作用域 */
    getAllEntities(sql: string, caret?: CaretPosition): EntityContext[] | null {
        return this.backend.getAllEntities(sql, caret)
    }

    /** 光标处语法补全（antlr4-c3）：syntax 类型 + keyword 列表 */
    getSuggestionAtCaretPosition(sql: string, caret: CaretPosition): Suggestions | null {
        return this.backend.getSuggestionAtCaretPosition(sql, caret)
    }
}
