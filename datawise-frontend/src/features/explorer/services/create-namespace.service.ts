import type {DbType} from '@/core/types'
import type {ContextMenuItem} from '@/core/types'
import {quoteSqlIdentifier} from '@/features/connection/services/db-type-quotes'
import {resolveApiErrorMessage, resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'

const MYSQL_FAMILY = new Set<DbType>(['mysql', 'mariadb', 'oceanbase', 'tidb', 'gbase8a'])
const OLAP_FAMILY = new Set<DbType>(['doris', 'starrocks'])
const POSTGRES_FAMILY = new Set<DbType>([
    'postgresql', 'kingbase', 'greenplum', 'opengauss', 'highgo', 'gaussdb',
])
const SQLSERVER_FAMILY = new Set<DbType>(['sqlserver'])
const CATALOG_SCHEMA_FAMILY = new Set<DbType>(['trino', 'presto', 'hive', 'flink'])
const ORACLE_LIKE = new Set<DbType>(['oracle', 'dm', 'dameng', 'db2', 'oscar'])
const UNSUPPORTED = new Set<DbType>([
    'mongodb', 'redis', 'kafka', 'yarn', 'ssh', 'elasticsearch', 'kylin', 'sqlite', 'hsql',
])

export type CreateNamespaceMode = 'database' | 'schema'

export function supportsCreateDatabase(dbType: DbType | undefined): boolean {
    if (!dbType || UNSUPPORTED.has(dbType) || ORACLE_LIKE.has(dbType)) return false
    if (CATALOG_SCHEMA_FAMILY.has(dbType)) return false
    return MYSQL_FAMILY.has(dbType)
        || OLAP_FAMILY.has(dbType)
        || POSTGRES_FAMILY.has(dbType)
        || SQLSERVER_FAMILY.has(dbType)
        || dbType === 'clickhouse'
        || dbType === 'hive'
}

export function supportsDropDatabase(dbType: DbType | undefined): boolean {
    return supportsCreateDatabase(dbType)
}

export function supportsCreateSchema(dbType: DbType | undefined): boolean {
    if (!dbType || UNSUPPORTED.has(dbType)) return false
    return POSTGRES_FAMILY.has(dbType)
        || SQLSERVER_FAMILY.has(dbType)
        || CATALOG_SCHEMA_FAMILY.has(dbType)
        || ORACLE_LIKE.has(dbType)
}

export function supportsMysqlCharsetOptions(dbType: DbType | undefined): boolean {
    return !!dbType && MYSQL_FAMILY.has(dbType)
}

function escapeSqlLiteral(value: string): string {
    return value.replace(/'/g, "''")
}

/** Keep in sync with backend NamespaceDdlSupport. */
export function buildCreateDatabaseSql(
    dbType: DbType | undefined,
    name: string,
    charset?: string | null,
    collation?: string | null,
): string {
    const trimmed = name.trim()
    if (!trimmed) return ''
    const quoted = quoteSqlIdentifier(dbType, trimmed)
    let sql = `CREATE DATABASE ${quoted}`
    if (supportsMysqlCharsetOptions(dbType)) {
        if (charset?.trim()) {
            sql += ` CHARACTER SET '${escapeSqlLiteral(charset.trim())}'`
        }
        if (collation?.trim()) {
            sql += ` COLLATE '${escapeSqlLiteral(collation.trim())}'`
        }
    }
    return sql
}

export function buildCreateSchemaSql(
    dbType: DbType | undefined,
    name: string,
    catalog?: string | null,
): string {
    const trimmed = name.trim()
    if (!trimmed) return ''
    const quotedName = quoteSqlIdentifier(dbType, trimmed)
    if (dbType && CATALOG_SCHEMA_FAMILY.has(dbType) && catalog?.trim()) {
        return `CREATE SCHEMA ${quoteSqlIdentifier(dbType, catalog.trim())}.${quotedName}`
    }
    return `CREATE SCHEMA ${quotedName}`
}

export function buildCreateNamespaceSql(
    mode: CreateNamespaceMode,
    dbType: DbType | undefined,
    options: {name: string; charset?: string | null; collation?: string | null; catalog?: string | null},
): string {
    return mode === 'schema'
        ? buildCreateSchemaSql(dbType, options.name, options.catalog)
        : buildCreateDatabaseSql(dbType, options.name, options.charset, options.collation)
}

const CREATE_NAMESPACE_MENU_IDS = new Set(['create-database', 'create-schema', 'delete-database'])

export function resolveCreateNamespaceErrorMessage(
    error: unknown,
    translate: (key: string) => string,
): string {
    const localized = resolveDisplayApiErrorMessage(error, translate)
    const raw = resolveApiErrorMessage(error)
    if (localized !== raw) return localized
    if (raw.includes('CONNECTION_ACCESS_DENIED')) {
        return translate('explorer.createNamespace.accessDenied')
    }
    return raw || translate('explorer.createNamespace.failed')
}

/** Hide unsupported create/delete database / create-schema context menu entries. */
export function filterCreateNamespaceMenuItems(
    items: ContextMenuItem[],
    dbType: DbType | undefined,
    options?: {canDdl?: boolean},
): ContextMenuItem[] {
    const hide = new Set<string>()
    if (!supportsCreateDatabase(dbType)) hide.add('create-database')
    if (!supportsDropDatabase(dbType)) hide.add('delete-database')
    if (!supportsCreateSchema(dbType)) hide.add('create-schema')
    if (options?.canDdl === false) {
        hide.add('create-database')
        hide.add('create-schema')
        hide.add('delete-database')
    }
    if (!hide.size) return items
    return items.filter((item) => !CREATE_NAMESPACE_MENU_IDS.has(item.id) || !hide.has(item.id))
}
