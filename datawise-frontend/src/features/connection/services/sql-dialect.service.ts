import type {DbType} from '@/core/types'
import {
    buildQualifiedTableName as buildQualifiedTableNameFromDbType,
    quoteSqlIdentifier as quoteSqlIdentifierFromDbType,
} from '@/features/connection/services/db-type-quotes'

export {resolveIdentifierQuote} from '@/features/connection/services/db-type-quotes'

/** SQL 标识符引用（规则来自 DbType.identifierQuote） */
export function quoteSqlIdentifier(
    dbType: DbType | undefined,
    value: string,
    options?: {quote?: string | null},
): string {
    return quoteSqlIdentifierFromDbType(dbType, value, options)
}

export function buildQualifiedTableName(
    dbType: DbType | undefined,
    database: string,
    tableName: string,
    options?: {quote?: string | null},
): string {
    return buildQualifiedTableNameFromDbType(dbType, database, tableName, options)
}
