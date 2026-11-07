import type {DbType} from '@/core/types'
import {isCatalogSchemaDbType} from '@/shared/db-type-families'

/**
 * 与后端 {@code DbType.getQuote()} 对齐的标识符引号。
 * 运行时优先使用 datasource catalog 返回的 {@code identifierQuote}。
 */
export const DB_TYPE_IDENTIFIER_QUOTES: Record<DbType, string> = {
    mysql: '`',
    mariadb: '`',
    oceanbase: '`',
    starrocks: '`',
    doris: '`',
    clickhouse: '`',
    hive: '`',
    kudu: '`',
    trino: '"',
    presto: '"',
    postgresql: '"',
    kingbase: '"',
    greenplum: '"',
    opengauss: '"',
    highgo: '"',
    gbase8a: '`',
    elasticsearch: '"',
    kylin: '"',
    oracle: '"',
    dm: '"',
    oscar: '"',
    db2: '"',
    sqlserver: '[',
    sqlite: '"',
    mongodb: '"',
    redis: '"',
    kafka: '"',
    tidb: '`',
    tdengine: '',
    sybase: '"',
    phoenix: '"',
    cachedb: '"',
    h2: '"',
    hsql: '"',
    generic: '`',
    other: '`',
    dameng: '"',
    gaussdb: '"',
    flink: '"',
    yarn: '"',
    jenkins: '"',
    nacos: '"',
    polaris: '"',
    kubernetes: '"',
    ssh: '"',
    plugin: '"',
}

const UPPERCASE_IDENTIFIER_DB_TYPES = new Set<DbType>(['oracle', 'dm', 'dameng'])

export function resolveIdentifierQuote(dbType: DbType | undefined, override?: string | null): string {
    if (override?.length) return override
    if (dbType && dbType in DB_TYPE_IDENTIFIER_QUOTES) {
        return DB_TYPE_IDENTIFIER_QUOTES[dbType]
    }
    return '"'
}

function applyFieldIde(dbType: DbType | undefined, value: string): string {
    if (dbType && UPPERCASE_IDENTIFIER_DB_TYPES.has(dbType)) {
        return value.toUpperCase()
    }
    return value
}

/** 引用单个 SQL 标识符，规则与后端 {@code DbType.quoteName} 一致。 */
export function quoteSqlIdentifier(
    dbType: DbType | undefined,
    value: string,
    options?: {quote?: string | null},
): string {
    if (!value.trim() || value === '*') return value
    const quote = resolveIdentifierQuote(dbType, options?.quote)
    const body = applyFieldIde(dbType, value)
    if (!quote) return body
    if (quote === '`') return `\`${body.replace(/`/g, '``')}\``
    if (quote === '"') return `"${body.replace(/"/g, '""')}"`
    if (quote === '[') return `[${body.replace(/]/g, ']]')}]`
    return `${quote}${body}${quote}`
}

/** 拼装限定表名，规则与后端 {@code DbType.quoteQualifiedTable} 一致。 */
export function buildQualifiedTableName(
    dbType: DbType | undefined,
    database: string,
    tableName: string,
    options?: {quote?: string | null},
): string {
    const quoteOpts = options
    const table = quoteSqlIdentifier(dbType, tableName, quoteOpts)
    if (!database.trim()) return table
    if (isCatalogSchemaDbType(dbType)) {
        const parts = database.split('.')
        if (parts.length >= 2) {
            const catalog = parts[0]!
            const schema = parts[1]!
            if (dbType === 'hive' && catalog.toLowerCase() === 'main') {
                return `${quoteSqlIdentifier(dbType, schema, quoteOpts)}.${table}`
            }
            return [
                quoteSqlIdentifier(dbType, catalog, quoteOpts),
                quoteSqlIdentifier(dbType, schema, quoteOpts),
                table,
            ].join('.')
        }
    }
    if (dbType === 'sqlserver') {
        const parts = database.split('.')
        if (parts.length >= 2) {
            const catalog = parts[0]!
            const schema = parts[1]!
            return [
                quoteSqlIdentifier(dbType, catalog, quoteOpts),
                quoteSqlIdentifier(dbType, schema, quoteOpts),
                table,
            ].join('.')
        }
        return [
            quoteSqlIdentifier(dbType, database, quoteOpts),
            quoteSqlIdentifier(dbType, 'dbo', quoteOpts),
            table,
        ].join('.')
    }
    return `${quoteSqlIdentifier(dbType, database, quoteOpts)}.${table}`
}
