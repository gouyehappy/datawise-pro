import {format as formatWithLibrary, type SqlLanguage} from 'sql-formatter'
import {
    getActiveSqlDialectFile,
    getFormatBreakKeywords,
    getFormatKeywords,
} from '@sql-editor/completion/keyword-config'
import type {ResolvedSqlEditorFormatterSettings} from '@sql-editor/config/formatter-settings'
import {getSqlEditorFormatterSettings} from '@sql-editor/config/snippets/cache'

const DIALECT_MAP: Record<string, SqlLanguage> = {
    mysql: 'mysql',
    mariadb: 'mysql',
    postgresql: 'postgresql',
    postgres: 'postgresql',
    sqlserver: 'transactsql',
    mssql: 'transactsql',
    oracle: 'plsql',
    sqlite: 'sqlite',
    bigquery: 'bigquery',
    snowflake: 'snowflake',
    redshift: 'redshift',
    hive: 'hive',
    spark: 'spark',
    flink: 'spark',
}

function resolveFormatterDialect(): SqlLanguage {
    const active = getActiveSqlDialectFile()?.toLowerCase()
    if (active && DIALECT_MAP[active]) return DIALECT_MAP[active]
    return 'sql'
}

function applyKeywordCase(keyword: string, keywordCase: ResolvedSqlEditorFormatterSettings['keywordCase']): string {
    if (keywordCase === 'preserve') return keyword
    if (keywordCase === 'lower') return keyword.toLowerCase()
    return keyword.toUpperCase()
}

function formatSqlFallback(sql: string, settings: ResolvedSqlEditorFormatterSettings): string {
    const dialect = getActiveSqlDialectFile()
    const keywords = getFormatKeywords(dialect)
    const breakBefore = getFormatBreakKeywords(dialect)

    let normalized = sql.replace(/\s+/g, ' ').trim()
    for (const keyword of keywords) {
        const cased = applyKeywordCase(keyword, settings.keywordCase)
        const pattern = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'gi')
        normalized = normalized.replace(pattern, cased)
    }
    for (const keyword of breakBefore) {
        const cased = applyKeywordCase(keyword, settings.keywordCase)
        const pattern = new RegExp(`\\s+(${keyword.replace(/\s+/g, '\\s+')})\\s+`, 'gi')
        normalized = normalized.replace(pattern, `\n${cased} `)
    }
    return normalized
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n')
}

/** SQL 格式化：优先 sql-formatter，失败时回退关键字换行 */
export function formatSql(input: string): string {
    const sql = input.trim()
    if (!sql) return sql

    const settings = getSqlEditorFormatterSettings()
    if (!settings.useLibrary) {
        return formatSqlFallback(sql, settings)
    }

    try {
        return formatWithLibrary(sql, {
            language: resolveFormatterDialect(),
            tabWidth: settings.tabWidth,
            useTabs: settings.useTabs,
            keywordCase: settings.keywordCase,
            identifierCase: settings.identifierCase,
            functionCase: settings.functionCase,
            indentStyle: settings.indentStyle,
            logicalOperatorNewline: settings.logicalOperatorNewline,
            linesBetweenQueries: settings.linesBetweenQueries,
            denseOperators: settings.denseOperators,
            newlineBeforeSemicolon: settings.newlineBeforeSemicolon,
        })
    } catch {
        return formatSqlFallback(sql, settings)
    }
}

export {
    SQL_EDITOR_FONT_SIZE_DEFAULT,
    SQL_EDITOR_FONT_SIZE_MAX,
    SQL_EDITOR_FONT_SIZE_MIN,
} from '@sql-editor/config/formatter-settings'

export type {
    SqlEditorFormatterSettings, SqlFormatterKeywordCase, SqlFormatterIndentStyle
} from '@sql-editor/config/formatter-settings'
